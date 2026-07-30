import { corsHeaders, json, loadRequests, saveRequests, type Env } from '../../../_lib/store';
import { requireStaffOrAdmin } from '../../../_lib/staffAuth';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400, origin);
  }

  const requestId = String(body.requestId ?? '').trim();
  const token = String(body.token ?? '').trim();
  if (!requestId) return json({ error: 'requestId is required.' }, 400, origin);

  let staffUsername: string | undefined;
  if (!token) {
    const auth = await requireStaffOrAdmin(request, env);
    if ('error' in auth) return json({ error: auth.error }, auth.status, origin);
    staffUsername = auth.session.username;
  }

  const list = await loadRequests(env);
  const index = list.findIndex(r => r.id === requestId && r.sessionKind === 'modern');
  if (index < 0) return json({ error: 'Session not found.' }, 404, origin);
  const item = list[index]!;
  if (token && item.memberJoinToken !== token) return json({ error: 'Session not found.' }, 404, origin);

  const now = new Date().toISOString();
  list[index] = {
    ...item,
    status: 'closed',
    closedAt: now,
    closeReason: String(body.closeReason ?? '').trim().slice(0, 240) || undefined,
    callState: 'ended',
    lastActivityAt: now,
    roomCode: undefined,
    roomIssuedAt: undefined,
    roomLastUsedAt: undefined
  };
  await saveRequests(env, list);
  return json({ ok: true, status: 'closed', closedBy: staffUsername ? 'staff' : 'member' }, 200, origin);
}
