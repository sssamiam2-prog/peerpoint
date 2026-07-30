import {
  corsHeaders,
  expireIdleRooms,
  findActiveRequestByRoom,
  json,
  loadRequests,
  saveRequests,
  type Env
} from '../_lib/store';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/**
 * GET /api/join?token=…
 * Resolves a member join token to an active room (chat or voice).
 */
export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  const token = (url.searchParams.get('token') ?? url.searchParams.get('t') ?? '').trim();
  if (!token || token.length < 8) {
    return json({ error: 'A valid join token is required.' }, 400, origin);
  }

  let list = await loadRequests(env);
  const expired = expireIdleRooms(list);
  if (expired.changed) {
    list = expired.list;
    await saveRequests(env, list);
  }

  const item = list.find(r => r.memberJoinToken === token);
  if (!item) {
    return json({ error: 'This join link is invalid or has expired.' }, 404, origin);
  }
  if (item.status === 'closed') {
    return json({ error: 'This session was closed. Ask Peer Support for a new link.' }, 410, origin);
  }
  if (item.status === 'queued') {
    return json(
      {
        status: 'queued',
        contactMode: item.contactMode === 'voice' ? 'voice' : 'chat',
        message: 'A peer has not accepted yet. Keep this page open or wait for a text/email when ready.'
      },
      200,
      origin
    );
  }
  if (item.status !== 'assigned' || !item.roomCode) {
    return json({ error: 'No active room for this link yet.' }, 409, origin);
  }

  // Ensure room still within idle TTL
  if (!findActiveRequestByRoom(list, item.roomCode)) {
    return json(
      { error: 'This room code expired after 24 hours of no use. Ask Peer Support for a new link.' },
      410,
      origin
    );
  }

  const mode = item.contactMode === 'voice' ? 'voice' : 'chat';
  const path =
    mode === 'voice'
      ? `/voice?room=${encodeURIComponent(item.roomCode)}&from=join`
      : `/chat?room=${encodeURIComponent(item.roomCode)}&from=join`;

  return json(
    {
      ok: true,
      status: 'assigned',
      room: item.roomCode,
      contactMode: mode,
      path,
      message: `Connecting to Peer ${mode}…`
    },
    200,
    origin
  );
}
