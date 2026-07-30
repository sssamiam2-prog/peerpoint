import {
  corsHeaders,
  expireIdleRooms,
  json,
  loadOnCallSlots,
  loadOnDuty,
  loadRequests,
  newId,
  onCallActiveAt,
  onCallOverlappingRange,
  randomRoomCode,
  saveOnCallSlots,
  saveOnDuty,
  saveRequests,
  type Env,
  type OnCallSlot
} from '../../_lib/store';
import {
  displayNameFor,
  ensureSeedAdmin,
  isOperationalPeer,
  isSeedAdminUsername,
  loadUsers,
  requireStaffOrAdmin,
  type StaffRole
} from '../../_lib/staffAuth';
import {
  availabilityPublicFields,
  markPeerAvailable,
  markPeerUnavailable,
  sweepUnavailableReminders
} from '../../_lib/peerAvailability';
import { normalizeOnCallModality, pickNextOnCallPeer, type SexPreference } from '../../_lib/onCallMatch';
import { emailRoomParticipants, notifyLeadersOfCoverageGap, notifyOnCallPeerWaiting } from '../../_lib/roomNotify';

type Ctx = { request: Request; env: Env; waitUntil?: (p: Promise<unknown>) => void };

type RosterPerson = {
  username: string;
  displayName: string;
  role: StaffRole;
  firstName: string;
  lastName: string;
  sex?: 'male' | 'female';
};

function parseIso(raw: unknown): Date | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

async function buildRoster(env: Env): Promise<RosterPerson[]> {
  await ensureSeedAdmin(env);
  const users = await loadUsers(env);
  return users
    .filter(u => isOperationalPeer(u))
    .map(u => ({
      username: u.username,
      displayName: displayNameFor(u),
      role: u.role,
      firstName: u.firstName,
      lastName: u.lastName,
      sex: u.sex === 'male' || u.sex === 'female' ? u.sex : undefined
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
}

function dayBoundsFromQuery(url: URL): { dayStart: Date; dayEnd: Date } | null {
  const day = url.searchParams.get('day')?.trim(); // YYYY-MM-DD (local calendar day from client)
  const offsetMinRaw = url.searchParams.get('tzOffsetMin');
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const offsetMin = offsetMinRaw != null && offsetMinRaw !== '' ? Number(offsetMinRaw) : 0;
  if (!Number.isFinite(offsetMin)) return null;
  // Construct local midnight as UTC by applying the client's timezone offset.
  // Date.UTC(y,m,d) + offsetMin*60000 = local midnight in absolute time when offset is
  // getTimezoneOffset() (minutes behind UTC).
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const dayStartMs = Date.UTC(y, m - 1, d) + offsetMin * 60_000;
  const dayStart = new Date(dayStartMs);
  const dayEnd = new Date(dayStartMs + 24 * 60 * 60 * 1000);
  return { dayStart, dayEnd };
}

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/** GET /api/staff/requests?day=YYYY-MM-DD&tzOffsetMin=360 */
export async function onRequestGet({ request, env, waitUntil }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const auth = await requireStaffOrAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, auth.status, origin);
  let requests = await loadRequests(env);
  const expired = expireIdleRooms(requests);
  if (expired.changed) {
    requests = expired.list;
    await saveRequests(env, requests);
  }

  const slots = await loadOnCallSlots(env);
  const onCallNow = onCallActiveAt(slots);
  const url = new URL(request.url);
  const bounds = dayBoundsFromQuery(url);
  const daySlots = bounds
    ? onCallOverlappingRange(slots, bounds.dayStart, bounds.dayEnd)
    : onCallOverlappingRange(
        slots,
        new Date(Date.now() - 12 * 60 * 60 * 1000),
        new Date(Date.now() + 36 * 60 * 60 * 1000)
      );

  const roster = await buildRoster(env);
  const legacyNames = await loadOnDuty(env);
  const onDuty = [
    ...new Set([...onCallNow.map(s => s.displayName), ...legacyNames.map(String)])
  ];

  const users = await loadUsers(env);
  const meUser = users.find(u => u.username === auth.session.username);
  const avail = availabilityPublicFields(meUser);

  // Best-effort half-hour reminders when staff are active in the app.
  const reminderTask = sweepUnavailableReminders(env).catch(() => undefined);
  if (typeof waitUntil === 'function') waitUntil(reminderTask);
  else void reminderTask;

  return json(
    {
      requests,
      onDuty,
      onCallNow,
      onCallSlots: daySlots,
      roster,
      me: {
        role: auth.session.role,
        username: auth.session.username,
        displayName: auth.session.displayName,
        peerAvailable: avail.peerAvailable,
        unavailableSince: avail.unavailableSince,
        unavailableReason: avail.unavailableReason
      }
    },
    200,
    origin
  );
}

/** PATCH /api/staff/requests */
export async function onRequestPatch({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const auth = await requireStaffOrAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, auth.status, origin);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON.' }, 400, origin);
  }

  if (body.action === 'setOnDuty') {
    const names = Array.isArray(body.names) ? body.names.map(n => String(n).trim()).filter(Boolean) : [];
    await saveOnDuty(env, names);
    return json({ ok: true, onDuty: names }, 200, origin);
  }

  if (body.action === 'addOnCall') {
    const selfOnly = body.self === true;
    let username = String(body.username ?? '')
      .trim()
      .toLowerCase();
    if (selfOnly || !username) {
      username = String(auth.session.username ?? '')
        .trim()
        .toLowerCase();
    }
    // Non-admins can only schedule themselves.
    if (auth.session.role !== 'admin' && username !== String(auth.session.username ?? '').toLowerCase()) {
      return json({ error: 'Staff can only add themselves to On Call.' }, 403, origin);
    }
    const start = parseIso(body.startAt);
    const end = parseIso(body.endAt);
    if (!username) return json({ error: 'Staff member is required.' }, 400, origin);
    if (!start || !end) return json({ error: 'Start and end times are required.' }, 400, origin);
    if (end.getTime() <= start.getTime()) {
      return json({ error: 'End time must be after start time.' }, 400, origin);
    }
    const maxMs = 36 * 60 * 60 * 1000;
    if (end.getTime() - start.getTime() > maxMs) {
      return json({ error: 'On-call blocks can be at most 36 hours.' }, 400, origin);
    }
    if (body.availabilityAcknowledged !== true) {
      return json(
        {
          error:
            'You must acknowledge that you are expected to be available during the selected On Call times.'
        },
        400,
        origin
      );
    }

    const users = await loadUsers(env);
    const user = users.find(u => u.username === username);
    if (!user || !user.active || !user.setupComplete) {
      return json({ error: 'That Staff/Admin account was not found or is inactive.' }, 404, origin);
    }
    if (isSeedAdminUsername(user.username)) {
      return json(
        {
          error:
            'The master Admin account is for control only and cannot be placed On Call. Invite or use a Peer Support Member account.'
        },
        400,
        origin
      );
    }

    const nowIso = new Date().toISOString();
    const modalities = normalizeOnCallModality(body.modalities);
    const slot: OnCallSlot = {
      id: newId(),
      username: user.username,
      displayName: displayNameFor(user),
      role: user.role,
      sex: user.sex === 'male' || user.sex === 'female' ? user.sex : undefined,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      createdBy: auth.session.username || 'unknown',
      createdAt: nowIso,
      availabilityAcknowledged: true,
      availabilityAcknowledgedAt: nowIso,
      modalities
    };
    const slots = await loadOnCallSlots(env);
    slots.push(slot);
    await saveOnCallSlots(env, slots);
    return json({ ok: true, slot, onCallNow: onCallActiveAt(slots) }, 200, origin);
  }

  if (body.action === 'removeOnCall') {
    const id = String(body.id ?? '').trim();
    if (!id) return json({ error: 'id is required.' }, 400, origin);
    const slots = await loadOnCallSlots(env);
    const next = slots.filter(s => s.id !== id);
    if (next.length === slots.length) return json({ error: 'On-call block not found.' }, 404, origin);
    await saveOnCallSlots(env, next);
    return json({ ok: true, onCallNow: onCallActiveAt(next) }, 200, origin);
  }

  if (body.action === 'setPeerAvailable') {
    const available = body.available === true;
    const username = auth.session.username;
    if (!username) return json({ error: 'Session username missing.' }, 400, origin);
    if (available) {
      const u = await markPeerAvailable(env, username);
      if (!u) return json({ error: 'Account not found.' }, 404, origin);
      return json(
        {
          ok: true,
          me: {
            peerAvailable: true,
            unavailableSince: undefined,
            unavailableReason: undefined
          }
        },
        200,
        origin
      );
    }
    const u = await markPeerUnavailable(env, username, String(body.reason ?? 'manually marked unavailable'));
    if (!u) return json({ error: 'Account not found.' }, 404, origin);
    return json(
      {
        ok: true,
        me: {
          peerAvailable: false,
          unavailableSince: u.unavailableSince,
          unavailableReason: u.unavailableReason
        }
      },
      200,
      origin
    );
  }

  const id = String(body.id ?? '').trim();
  if (!id) return json({ error: 'id is required.' }, 400, origin);

  let list = await loadRequests(env);
  const purged = expireIdleRooms(list);
  if (purged.changed) list = purged.list;

  const idx = list.findIndex(r => r.id === id);
  if (idx < 0) return json({ error: 'Request not found.' }, 404, origin);
  const item = { ...list[idx]! };

  if (body.action === 'assign') {
    const peer =
      String(body.assignedPeer ?? '').trim() ||
      auth.session.displayName ||
      auth.session.username ||
      'Peer';
    let roomCode = String(body.roomCode ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (roomCode.length < 4) roomCode = randomRoomCode();
    const nowIso = new Date().toISOString();
    item.status = 'assigned';
    item.assignedPeer = peer;
    item.assignedPeerUsername = auth.session.username || item.assignedPeerUsername;
    item.roomCode = roomCode.slice(0, 24);
    item.roomIssuedAt = nowIso;
    item.roomLastUsedAt = nowIso;
    if (!item.memberJoinToken) item.memberJoinToken = newId();
    list[idx] = item;
    await saveRequests(env, list);
    if (item.assignedPeerUsername) {
      await markPeerUnavailable(env, item.assignedPeerUsername, 'supporting a peer (assigned request)');
    }
    let emailed: Awaited<ReturnType<typeof emailRoomParticipants>> | undefined;
    if (!item.roomNotifySentAt) {
      emailed = await emailRoomParticipants(env, item);
      item.roomNotifySentAt = nowIso;
      list[idx] = item;
      await saveRequests(env, list);
    }
    return json({ ok: true, request: item, emailed }, 200, origin);
  }

  if (body.action === 'acceptQueue') {
    const me = String(auth.session.username ?? '').toLowerCase();
    const offered = String(item.assignedPeerUsername ?? '').toLowerCase();
    if (item.status !== 'queued') {
      return json({ error: 'This request is not waiting for accept.' }, 400, origin);
    }
    if (auth.session.role !== 'admin' && offered !== me) {
      return json({ error: 'This queue request was offered to another peer.' }, 403, origin);
    }
    const nowIso = new Date().toISOString();
    const roomCode = item.roomCode && item.roomCode.length >= 4 ? item.roomCode : randomRoomCode();
    item.status = 'assigned';
    item.roomCode = roomCode.slice(0, 24);
    item.roomIssuedAt = nowIso;
    item.roomLastUsedAt = nowIso;
    item.acceptedAt = nowIso;
    item.assignedPeer = auth.session.displayName || auth.session.username || item.assignedPeer;
    item.assignedPeerUsername = auth.session.username || item.assignedPeerUsername;
    if (!item.memberJoinToken) item.memberJoinToken = newId();
    list[idx] = item;
    await saveRequests(env, list);
    if (item.assignedPeerUsername) {
      await markPeerUnavailable(env, item.assignedPeerUsername, `supporting a peer (${item.contactMode || 'chat'})`);
    }
    let emailed: Awaited<ReturnType<typeof emailRoomParticipants>> | undefined;
    if (!item.roomNotifySentAt) {
      emailed = await emailRoomParticipants(env, item);
      item.roomNotifySentAt = nowIso;
      list[idx] = item;
      await saveRequests(env, list);
    }
    return json(
      {
        ok: true,
        request: item,
        roomCode: item.roomCode,
        contactMode: item.contactMode === 'voice' ? 'voice' : 'chat',
        joinPath: item.contactMode === 'voice' ? `/voice?room=${item.roomCode}` : `/chat?room=${item.roomCode}`,
        emailed: emailed ?? {
          memberEmailed: false,
          staffEmailed: false,
          memberSms: false,
          staffSms: false,
          smsConfigured: false,
          summary: 'Join links already sent when the request was created.'
        }
      },
      200,
      origin
    );
  }

  if (body.action === 'declineQueue') {
    const me = String(auth.session.username ?? '').toLowerCase();
    const offered = String(item.assignedPeerUsername ?? '').toLowerCase();
    if (item.status !== 'queued') {
      return json({ error: 'This request is not waiting for accept.' }, 400, origin);
    }
    if (auth.session.role !== 'admin' && offered !== me) {
      return json({ error: 'This queue request was offered to another peer.' }, 403, origin);
    }

    const sexPreference: SexPreference =
      item.preferredPeerSex === 'male' || item.preferredPeerSex === 'female'
        ? item.preferredPeerSex
        : 'either';
    const contactMode = item.contactMode === 'voice' ? 'voice' : 'chat';
    const preferredSexLabel =
      sexPreference === 'either' ? 'Either (no preference)' : sexPreference === 'male' ? 'Male' : 'Female';

    // Try next free on-call peer (skip declining peer + anyone already busy).
    const next = await pickNextOnCallPeer(env, sexPreference, {
      excludeUsernames: [auth.session.username, item.assignedPeerUsername].filter(Boolean) as string[]
    });

    if (next.ok) {
      item.assignedPeer = next.chosen.displayName;
      item.assignedPeerUsername = next.chosen.user.username;
      item.queuedAt = new Date().toISOString();
      list[idx] = item;
      await saveRequests(env, list);
      let alert: Awaited<ReturnType<typeof notifyOnCallPeerWaiting>> | Awaited<ReturnType<typeof emailRoomParticipants>>;
      if (item.roomCode && item.memberJoinToken) {
        // Room already exists — text the next peer the join link (skip re-texting the member).
        const staffOnly = { ...item };
        staffOnly.requesterPhone = 'not provided';
        staffOnly.requesterEmail = 'not-provided@peerpoint.local';
        alert = await emailRoomParticipants(env, staffOnly);
      } else {
        alert = await notifyOnCallPeerWaiting(env, {
          staff: next.chosen.user,
          contactMode,
          preferredSexLabel
        });
      }
      return json(
        {
          ok: true,
          reoffered: true,
          request: item,
          nextPeer: next.chosen.displayName,
          notify: alert
        },
        200,
        origin
      );
    }

    item.status = 'closed';
    item.roomCode = undefined;
    item.roomIssuedAt = undefined;
    item.roomLastUsedAt = undefined;
    list[idx] = item;
    await saveRequests(env, list);
    const leader = await notifyLeadersOfCoverageGap(env, {
      reason: `On-call peer declined a waiting ${contactMode} request and no other free peer was available.`,
      contactMode,
      memberHint: item.requesterName
        ? `Member display name on file: ${item.requesterName}`
        : 'Member was waiting in the peer queue.'
    });
    return json({ ok: true, reoffered: false, request: item, leaders: leader }, 200, origin);
  }

  if (body.action === 'close') {
    item.status = 'closed';
    item.roomCode = undefined;
    item.roomIssuedAt = undefined;
    item.roomLastUsedAt = undefined;
    list[idx] = item;
    await saveRequests(env, list);
    return json({ ok: true, request: item }, 200, origin);
  }

  if (body.action === 'addNote') {
    const text = String(body.text ?? '').trim();
    if (!text) return json({ error: 'Note text is required.' }, 400, origin);
    if (text.length > 4000) return json({ error: 'Note is too long (max 4000 characters).' }, 400, origin);
    const note = {
      id: newId(),
      text,
      createdAt: new Date().toISOString(),
      createdBy: auth.session.username || 'unknown',
      createdByDisplay: auth.session.displayName || auth.session.username || 'Staff'
    };
    item.notes = [...(item.notes ?? []), note];
    list[idx] = item;
    await saveRequests(env, list);
    return json({ ok: true, request: item, note }, 200, origin);
  }

  if (body.action === 'addTime') {
    const minutes = Number(body.minutes);
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 24 * 60) {
      return json({ error: 'Enter time spent in minutes (1–1440).' }, 400, origin);
    }
    const me = String(auth.session.username ?? '').toLowerCase();
    const assignedToMe =
      String(item.assignedPeerUsername ?? '')
        .trim()
        .toLowerCase() === me;
    if (auth.session.role !== 'admin' && !assignedToMe) {
      return json({ error: 'Only the assigned Peer Support Member (or Admin) can log time.' }, 403, origin);
    }
    const note = String(body.note ?? '').trim().slice(0, 500) || undefined;
    const entry = {
      id: newId(),
      minutes: Math.round(minutes),
      note,
      createdAt: new Date().toISOString(),
      createdBy: auth.session.username || 'unknown',
      createdByDisplay: auth.session.displayName || auth.session.username || 'Staff'
    };
    item.timeEntries = [...(item.timeEntries ?? []), entry];
    list[idx] = item;
    await saveRequests(env, list);
    return json({ ok: true, request: item, timeEntry: entry }, 200, origin);
  }

  return json(
    {
      error:
        'Unknown action. Use assign, acceptQueue, declineQueue, close, addNote, addTime, addOnCall, removeOnCall, setPeerAvailable, or setOnDuty.'
    },
    400,
    origin
  );
}
