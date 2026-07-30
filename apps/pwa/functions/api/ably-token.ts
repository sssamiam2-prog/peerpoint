import {
  corsHeaders,
  createAblyTokenDetails,
  createAblyTokenDetailsForChannels,
  expireIdleRooms,
  findActiveRequestByRoom,
  json,
  loadRequests,
  saveRequests,
  type Env
} from '../_lib/store';
import { requireStaffOrAdmin } from '../_lib/staffAuth';

type Ctx = { request: Request; env: Env };

function normalizeRoom(raw: string | null): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 4 || code.length > 24) return null;
  return code;
}

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/**
 * GET /api/ably-token?room=CODE&clientId=peer-...
 * GET /api/ably-token?requestId=...&token=...&clientId=...
 * GET /api/ably-token?requestId=...&staffToken=...&clientId=...
 * Only issues tokens for room codes that are still active (assigned and used within 24 hours).
 * A successful token refresh counts as "use" and extends the idle window.
 */
export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  const room = normalizeRoom(url.searchParams.get('room'));
  const requestId = url.searchParams.get('requestId')?.trim() ?? '';
  const memberToken = url.searchParams.get('token')?.trim() ?? '';
  // Ably authUrl GET refreshes cannot reliably attach Authorization headers.
  // Treat this as a short-lived fallback and never log request query strings.
  const staffToken = url.searchParams.get('staffToken')?.trim() ?? '';
  const clientId = (url.searchParams.get('clientId') ?? '').trim();
  if (!clientId || clientId.length > 128) {
    return json({ error: 'Query param clientId is required.' }, 400, origin);
  }
  const apiKey = env.ABLY_API_KEY?.trim();
  if (!apiKey) {
    return json(
      { error: 'Server missing ABLY_API_KEY secret. Set it on the Cloudflare Pages project.' },
      503,
      origin
    );
  }

  if (requestId) {
    const list = await loadRequests(env);
    const item = list.find(r => r.id === requestId && r.sessionKind === 'modern');
    if (!item || !item.ablyChannelName || (item.status !== 'queued' && item.status !== 'assigned')) {
      return json({ error: 'Session not found.' }, 404, origin);
    }

    let staffAccess = false;
    if (memberToken) {
      if (item.memberJoinToken !== memberToken) return json({ error: 'Session not found.' }, 404, origin);
    } else {
      const staffRequest =
        staffToken && !request.headers.get('Authorization')
          ? new Request(request, { headers: new Headers({ ...Object.fromEntries(request.headers), Authorization: `Bearer ${staffToken}` }) })
          : request;
      const auth = await requireStaffOrAdmin(staffRequest, env);
      if ('error' in auth) return json({ error: auth.error }, auth.status, origin);
      staffAccess = auth.session.role === 'admin' || item.assignedPeerUsername === auth.session.username;
      if (!staffAccess) return json({ error: 'Forbidden.' }, 403, origin);
    }

    try {
      const capability: Record<string, string[]> = {
        [item.ablyChannelName]: ['subscribe', 'publish', 'presence', 'history']
      };
      if (staffAccess) capability['peer-support:queue'] = ['subscribe', 'publish', 'presence'];
      const tokenDetails = await createAblyTokenDetailsForChannels(apiKey, clientId, capability);
      return json(tokenDetails, 200, origin);
    } catch (e: unknown) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 502, origin);
    }
  }

  if (!room) {
    return json({ error: 'Query param room or requestId is required.' }, 400, origin);
  }

  // Gate tokens to staff-issued room codes; expire after 24 hours idle.
  if (env.PEERPOINT_KV) {
    let list = await loadRequests(env);
    const expired = expireIdleRooms(list);
    if (expired.changed) {
      list = expired.list;
      await saveRequests(env, list);
    }
    const match = findActiveRequestByRoom(list, room);
    if (!match) {
      return json(
        {
          error:
            'This room code is invalid or has expired after 24 hours of no use. Check your email for the code, or ask staff for a new one.'
        },
        410,
        origin
      );
    }
    const idx = list.findIndex(r => r.id === match.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx]!, roomLastUsedAt: new Date().toISOString() };
      await saveRequests(env, list);
    }
  }

  try {
    const channel = `peerpoint:room:${room}`;
    const tokenDetails = await createAblyTokenDetails(apiKey, clientId, channel);
    return json(tokenDetails, 200, origin);
  } catch (e: unknown) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502, origin);
  }
}
