import { notifyOnCallPeerWaiting } from '../../_lib/roomNotify';
import { pickNextOnCallPeer, type SexPreference } from '../../_lib/onCallMatch';
import { isValidMemberAccessCode } from '../../_lib/memberAccess';
import { mapSessionStatus } from '../../_lib/peerSupportSession';
import {
  ablyChannelForRequest,
  corsHeaders,
  json,
  livekitRoomForRequest,
  loadRequests,
  newId,
  randomPublicSupportCode,
  randomRoomCode,
  saveRequests,
  type Env,
  type HelpRequest
} from '../../_lib/store';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  const requestId = url.searchParams.get('requestId')?.trim() ?? '';
  const token = url.searchParams.get('token')?.trim() ?? '';
  const item = (await loadRequests(env)).find(
    r => r.id === requestId && r.sessionKind === 'modern' && r.memberJoinToken === token
  );
  if (!item) return json({ error: 'Session not found.' }, 404, origin);

  const active = item.status === 'queued' || item.status === 'assigned';
  return json(
    {
      status: mapSessionStatus(item.status),
      publicSupportCode: item.publicSupportCode,
      staffJoined: item.status === 'assigned',
      ...(active && item.ablyChannelName ? { ablyChannelName: item.ablyChannelName } : {}),
      livekitConfigured: Boolean(
        env.LIVEKIT_URL?.trim() && env.LIVEKIT_API_KEY?.trim() && env.LIVEKIT_API_SECRET?.trim()
      ),
      expiresAt: item.expiresAt
    },
    200,
    origin
  );
}

export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400, origin);
  }
  const accessCode = body.accessCode ?? body.siteUseCode;
  if (!isValidMemberAccessCode(accessCode)) {
    return json({ error: 'A valid site use code is required.' }, 403, origin);
  }

  const rawPreference = String(body.sexPreference ?? 'either').trim().toLowerCase();
  const sexPreference = rawPreference as SexPreference;
  if (sexPreference !== 'male' && sexPreference !== 'female' && sexPreference !== 'either') {
    return json({ error: 'Choose Male, Female, or Either peer preference.' }, 400, origin);
  }

  const match = await pickNextOnCallPeer(env, sexPreference);
  if (!match.ok) return json({ error: match.error }, 409, origin);

  const now = new Date();
  const nowIso = now.toISOString();
  const requestId = newId();
  const memberJoinToken = newId();
  const record: HelpRequest = {
    id: requestId,
    submittedAt: nowIso,
    queuedAt: nowIso,
    requesterName: 'Anonymous',
    memberDisplayName: 'Anonymous',
    requesterPhone: 'not provided',
    requesterEmail: 'not-provided@peerpoint.local',
    preferredContact: 'chat',
    description: `Modern anonymous session — preferred ${sexPreference} peer`,
    consentAcknowledged: true,
    status: 'queued',
    sessionKind: 'modern',
    assignedPeer: match.chosen.displayName,
    assignedPeerUsername: match.chosen.user.username,
    preferredPeerSex: sexPreference === 'either' ? undefined : sexPreference,
    contactMode: 'chat',
    memberJoinToken,
    anonymousSessionId: newId(),
    publicSupportCode: randomPublicSupportCode(),
    ablyChannelName: ablyChannelForRequest(requestId),
    livekitRoomName: livekitRoomForRequest(requestId),
    roomCode: randomRoomCode(),
    roomIssuedAt: nowIso,
    roomLastUsedAt: nowIso,
    callState: 'waiting',
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    lastActivityAt: nowIso
  };

  const list = await loadRequests(env);
  list.unshift(record);
  await saveRequests(env, list.slice(0, 500));
  await notifyOnCallPeerWaiting(env, {
    staff: match.chosen.user,
    contactMode: 'chat',
    preferredSexLabel: sexPreference === 'either' ? 'Either' : sexPreference
  });

  return json(
    {
      ok: true,
      requestId,
      publicSupportCode: record.publicSupportCode,
      anonymousSessionToken: memberJoinToken,
      status: 'waiting',
      expiresAt: record.expiresAt
    },
    201,
    origin
  );
}
