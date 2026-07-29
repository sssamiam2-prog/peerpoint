/**
 * GET /api/immediate-contact → availability (delegates to same matching as peer-queue).
 * POST → creates a queued chat/voice request (same as /api/peer-queue) for Request Help UI.
 */

import { sendOnCallAlertEmail } from '../_lib/email';
import { isValidMemberAccessCode } from '../_lib/memberAccess';
import {
  availabilityCounts,
  freeInPersonOnCallCandidates,
  freeOnCallCandidates,
  pickNextOnCallPeer,
  type SexPreference
} from '../_lib/onCallMatch';
import { notifyLeadersOfCoverageGap } from '../_lib/roomNotify';
import { loadUsers, MEMBER_ORIGIN } from '../_lib/staffAuth';
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

export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const slots = onCallActiveAt(await loadOnCallSlots(env));
  const users = await loadUsers(env);
  const free = freeOnCallCandidates(slots, users);
  const freeInPerson = freeInPersonOnCallCandidates(slots, users);
  const counts = availabilityCounts(free, freeInPerson);
  return json({ available: free.length > 0, ...counts }, 200, origin);
}

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

  const requesterPhone = String(body.requesterPhone ?? '').trim();
  const requesterEmail = String(body.requesterEmail ?? '').trim();
  const consentAcknowledged = Boolean(body.consentAcknowledged);
  const employmentAttested = Boolean(body.employmentAttested);
  const bureau = String(body.bureau ?? '').trim();
  const employmentTypeRaw = String(body.employmentType ?? '').trim().toLowerCase();
  const displayName =
    String(body.requesterName ?? '').trim() ||
    String(body.displayName ?? '').trim() ||
    'Member';

  if (!requesterPhone) return json({ error: 'Phone number is required.' }, 400, origin);
  if (!requesterEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) {
    return json({ error: 'Valid email is required.' }, 400, origin);
  }
  if (!consentAcknowledged) return json({ error: 'Consent is required.' }, 400, origin);
  if (!employmentAttested) {
    return json(
      { error: 'You must attest that you are currently employed by the Salt Lake County Sheriff’s Office.' },
      400,
      origin
    );
  }
  if (!bureau) return json({ error: 'Bureau is required.' }, 400, origin);
  if (employmentTypeRaw !== 'civilian' && employmentTypeRaw !== 'sworn') {
    return json({ error: 'Select Civilian or Sworn.' }, 400, origin);
  }

  const match = await pickNextOnCallPeer(env, sexPreference);
  if (!match.ok) {
    const leaders = await notifyLeadersOfCoverageGap(env, {
      reason: match.error,
      contactMode,
      memberHint: `Immediate contact request (preference: ${sexPreference}).`
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
    employmentAttested: true,
    bureau,
    employmentType: employmentTypeRaw,
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
