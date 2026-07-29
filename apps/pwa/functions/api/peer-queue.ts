import { sendOnCallAlertEmail } from '../_lib/email';
import { notifyLeadersOfCoverageGap } from '../_lib/roomNotify';
import {
  availabilityCounts,
  freeInPersonOnCallCandidates,
  freeOnCallCandidates,
  pickNextOnCallPeer,
  type SexPreference
} from '../_lib/onCallMatch';
import { isValidMemberAccessCode } from '../_lib/memberAccess';
import { MEMBER_ORIGIN } from '../_lib/staffAuth';
import { loadUsers } from '../_lib/staffAuth';
import {
  corsHeaders,
  json,
  loadOnCallSlots,
  loadRequests,
  newId,
  notifyTeams,
  onCallActiveAt,
  saveRequests,
  type Env,
  type HelpRequest
} from '../_lib/store';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/**
 * GET /api/peer-queue
 * - ?id=&token=  → member status / room when accepted
 * - else → public availability counts
 */
export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  const id = url.searchParams.get('id')?.trim() ?? '';
  const token = url.searchParams.get('token')?.trim() ?? '';

  if (id && token) {
    const list = await loadRequests(env);
    const item = list.find(r => r.id === id && r.memberJoinToken === token);
    if (!item) return json({ error: 'Session not found or expired.' }, 404, origin);
    if (item.status === 'closed') {
      return json({ status: 'closed', contactMode: item.contactMode }, 200, origin);
    }
    if (item.status === 'queued') {
      return json(
        {
          status: 'queued',
          contactMode: item.contactMode,
          message: 'Waiting for an on-call peer to accept…'
        },
        200,
        origin
      );
    }
    if (item.status === 'assigned' && item.roomCode) {
      return json(
        {
          status: 'assigned',
          contactMode: item.contactMode,
          room: item.roomCode,
          displayName: item.memberDisplayName,
          message: 'A peer accepted. Connecting…'
        },
        200,
        origin
      );
    }
    return json({ status: item.status, contactMode: item.contactMode }, 200, origin);
  }

  const slots = onCallActiveAt(await loadOnCallSlots(env));
  const users = await loadUsers(env);
  const free = freeOnCallCandidates(slots, users);
  const freeInPerson = freeInPersonOnCallCandidates(slots, users);
  const counts = availabilityCounts(free, freeInPerson);
  return json({ available: free.length > 0, ...counts }, 200, origin);
}

/**
 * POST /api/peer-queue
 * Member joins chat/voice queue. Alerts next free on-call peer. No room code returned.
 */
export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400, origin);
  }

  if (!isValidMemberAccessCode(body.accessCode)) {
    return json({ error: 'A valid site use code is required.' }, 403, origin);
  }

  const contactMode = String(body.contactMode ?? '').trim().toLowerCase();
  if (contactMode !== 'chat' && contactMode !== 'voice') {
    return json({ error: 'Choose Chat or Voice.' }, 400, origin);
  }

  const sexRaw = String(body.sexPreference ?? '').trim().toLowerCase();
  const sexPreference = (sexRaw === 'any' ? 'either' : sexRaw) as SexPreference | '';
  if (sexPreference !== 'male' && sexPreference !== 'female' && sexPreference !== 'either') {
    return json({ error: 'Choose Male, Female, or Either peer preference.' }, 400, origin);
  }

  const displayName = String(body.displayName ?? body.requesterName ?? '').trim();
  if (displayName.length < 1) {
    return json({ error: 'Enter a display name for the session.' }, 400, origin);
  }
  if (displayName.length > 40) {
    return json({ error: 'Display name must be 40 characters or fewer.' }, 400, origin);
  }

  const match = await pickNextOnCallPeer(env, sexPreference);
  if (!match.ok) {
    const leaders = await notifyLeadersOfCoverageGap(env, {
      reason: match.error,
      contactMode,
      memberHint: `Member tried to start ${contactMode} (preference: ${sexPreference}).`
    });
    return json(
      {
        error: match.error,
        leadersNotified: leaders.leadersNotified,
        leaderCount: leaders.leaderCount
      },
      409,
      origin
    );
  }

  const chosen = match.chosen;
  const nowIso = new Date().toISOString();
  const memberJoinToken = newId();
  const requesterPhone = String(body.requesterPhone ?? '').trim() || 'not provided';
  const requesterEmail = String(body.requesterEmail ?? '').trim() || 'not-provided@peerpoint.local';

  const record: HelpRequest = {
    id: newId(),
    submittedAt: nowIso,
    queuedAt: nowIso,
    requesterName: displayName,
    memberDisplayName: displayName,
    requesterPhone,
    requesterEmail,
    preferredContact: contactMode,
    description: `Queued ${contactMode} — preferred ${sexPreference} peer`,
    consentAcknowledged: true,
    status: 'queued',
    assignedPeer: chosen.displayName,
    assignedPeerUsername: chosen.user.username,
    preferredPeerSex: sexPreference === 'either' ? undefined : sexPreference,
    contactMode,
    memberJoinToken
  };

  const list = await loadRequests(env);
  list.unshift(record);
  await saveRequests(env, list.slice(0, 500));

  const staffEmail = chosen.user.workEmail || chosen.user.email || chosen.user.personalEmail || '';
  let emailed = false;
  if (staffEmail) {
    const mail = await sendOnCallAlertEmail(env, {
      to: staffEmail,
      staffFirstName: chosen.user.firstName,
      contactMode,
      staffUrl: `${MEMBER_ORIGIN}/staff`,
      preferredSexLabel:
        sexPreference === 'either' ? 'Either (no preference)' : sexPreference === 'male' ? 'Male' : 'Female'
    });
    emailed = mail.ok && mail.emailed === true;
  }

  await notifyTeams(
    env,
    `PEERPoint queued ${contactMode} (${record.id})\nPreferred: ${sexPreference}\nOffered to: ${chosen.user.username}\nEmailed: ${emailed ? 'yes' : 'no'}`
  );

  return json(
    {
      ok: true,
      requestId: record.id,
      memberJoinToken,
      contactMode,
      status: 'queued',
      emailedStaff: emailed,
      message:
        'You are in the queue. An on-call peer has been notified. Stay on this page — when they accept, you will get a room code here and by email (use it to reconnect if you disconnect).'
    },
    201,
    origin
  );
}
