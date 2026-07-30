import { buildLiveKitJwtClaims, signLiveKitJwt } from '../_lib/peerSupportSession';
import { corsHeaders, json, loadRequests, type Env } from '../_lib/store';
import { requireStaffOrAdmin } from '../_lib/staffAuth';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const livekitUrl = env.LIVEKIT_URL?.trim();
  const apiKey = env.LIVEKIT_API_KEY?.trim();
  const apiSecret = env.LIVEKIT_API_SECRET?.trim();
  if (!livekitUrl || !apiKey || !apiSecret) {
    return json({ error: 'LiveKit is not configured.', fallback: 'webrtc' }, 503, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400, origin);
  }
  const requestId = String(body.requestId ?? '').trim();
  const memberToken = String(body.token ?? '').trim();
  if (!requestId) return json({ error: 'requestId is required.' }, 400, origin);

  const item = (await loadRequests(env)).find(
    r => r.id === requestId && r.sessionKind === 'modern' && r.status === 'assigned' && r.livekitRoomName
  );
  if (!item) return json({ error: 'Session not found.' }, 404, origin);

  let identity: string;
  if (memberToken) {
    if (item.memberJoinToken !== memberToken || !item.anonymousSessionId) {
      return json({ error: 'Session not found.' }, 404, origin);
    }
    identity = `anonymous-${item.anonymousSessionId}`;
  } else {
    const auth = await requireStaffOrAdmin(request, env);
    if ('error' in auth) return json({ error: auth.error }, auth.status, origin);
    if (item.assignedPeerUsername !== auth.session.username) return json({ error: 'Forbidden.' }, 403, origin);
    identity = `staff-${auth.session.username}`;
  }

  const claims = buildLiveKitJwtClaims(apiKey, identity, item.livekitRoomName!);
  const token = await signLiveKitJwt(claims, apiSecret);
  return json({ url: livekitUrl, token, roomName: item.livekitRoomName, identity }, 200, origin);
}
