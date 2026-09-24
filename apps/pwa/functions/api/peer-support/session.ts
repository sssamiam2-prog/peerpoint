import { notifyLeadersOfCoverageGap, notifyOnCallPeerWaiting } from '../../_lib/roomNotify';
import { parseMatchPreference, pickNextOnCallPeer } from '../../_lib/onCallMatch';
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

  const preference = parseMatchPreference({
    ...body,
    matchMode: body.matchMode ?? body.peerChoice ?? 'anyone',
    sexPreference: body.sexPreference ?? 'either'
  });
  if ('error' in preference) return json({ error: preference.error }, 400, origin);

  const match = await pickNextOnCallPeer(env, preference);
  if (!match.ok) {
    const leaders = await notifyLeadersOfCoverageGap(env, {
      reason: match.error,
      contactMode: 'chat',
      memberHint: `Modern session request (choice: ${preference.mode}).`
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

  const now = new Date();
  const nowIso = now.toISOString();
  const requestId = newId();
  const memberJoinToken = newId();
  const prefLabel =
    preference.mode === 'specific'
      ? `peer ${preference.preferredUsername}`
      : preference.mode === 'classification'
        ? preference.preferredClassification
        : preference.sexPreference === 'male' || preference.sexPreference === 'female'
          ? preference.sexPreference
          : 'anyone';
  const record: HelpRequest = {
    id: requestId,
    submittedAt: nowIso,
    queuedAt: nowIso,
    requesterName: 'Anonymous',
    memberDisplayName: 'Anonymous',
    requesterPhone: 'not provided',
    requesterEmail: 'not-provided@peerpoint.local',
    preferredContact: 'chat',
    description: `Modern anonymous session — preferred ${prefLabel}`,
    consentAcknowledged: true,
    status: 'queued',
    sessionKind: 'modern',
    assignedPeer: match.chosen.displayName,
    assignedPeerUsername: match.chosen.user.username,
    preferredPeerSex:
      preference.sexPreference === 'male' || preference.sexPreference === 'female'
        ? preference.sexPreference
        : undefined,
    matchMode: preference.mode,
    preferredPeerUsername: preference.preferredUsername,
    preferredPeerClassification: preference.preferredClassification,
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
    preferredSexLabel: prefLabel ?? 'Anyone'
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
