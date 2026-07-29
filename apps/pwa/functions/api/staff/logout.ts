import { corsHeaders, json, type Env } from '../../_lib/store';
import { requireSession, revokeSession } from '../../_lib/staffAuth';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/** POST /api/staff/logout — revoke current Bearer session */
export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const auth = await requireSession(request, env);
  if ('error' in auth) {
    // Already invalid — treat as signed out
    return json({ ok: true }, 200, origin);
  }
  await revokeSession(env, auth.token);
  return json({ ok: true }, 200, origin);
}
