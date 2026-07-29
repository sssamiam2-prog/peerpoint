import {
  corsHeaders,
  json,
  loadRequests,
  newId,
  randomRoomCode,
  saveRequests,
  type Env,
  type HelpRequest
} from '../../_lib/store';
import { requireAdmin } from '../../_lib/staffAuth';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/**
 * POST /api/staff/test-room
 * Admin-only: mint an assigned room code for smoke-testing Peer chat / voice.
 */
export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const auth = await requireAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, auth.status, origin);
  if (!env.PEERPOINT_KV) {
    return json({ error: 'PEERPOINT_KV is required.' }, 503, origin);
  }

  let contactMode: 'chat' | 'voice' = 'chat';
  try {
    const body = (await request.json()) as { contactMode?: string };
    if (body.contactMode === 'voice') contactMode = 'voice';
  } catch {
    /* empty body ok */
  }

  const nowIso = new Date().toISOString();
  const roomCode = randomRoomCode();
  const record: HelpRequest = {
    id: newId(),
    submittedAt: nowIso,
    requesterName: 'Admin test',
    memberDisplayName: 'Admin test',
    requesterPhone: 'test',
    requesterEmail: 'admin-test@peerpoint.local',
    preferredContact: contactMode,
    description: `Admin test room (${contactMode}) — safe to close`,
    consentAcknowledged: true,
    status: 'assigned',
    assignedPeer: auth.session.displayName || auth.session.username || 'Admin',
    assignedPeerUsername: auth.session.username,
    contactMode,
    roomCode,
    roomIssuedAt: nowIso,
    roomLastUsedAt: nowIso,
    memberJoinToken: newId(),
    acceptedAt: nowIso
  };

  const list = await loadRequests(env);
  list.unshift(record);
  await saveRequests(env, list.slice(0, 500));

  return json(
    {
      ok: true,
      roomCode,
      contactMode,
      requestId: record.id,
      chatPath: `/chat?room=${encodeURIComponent(roomCode)}`,
      voicePath: `/voice?room=${encodeURIComponent(roomCode)}`,
      message:
        'Test room created. Open Chat and Voice with this code (two browsers or devices) to verify both sides connect.'
    },
    201,
    origin
  );
}
