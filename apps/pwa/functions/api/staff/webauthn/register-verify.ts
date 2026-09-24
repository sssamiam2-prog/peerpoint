import { corsHeaders, json, type Env } from '../../../_lib/store';
import { ensureSeedAdmin, requireStaffOrAdmin } from '../../../_lib/staffAuth';
import { verifyRegistration } from '../../../_lib/webauthn';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/** POST /api/staff/webauthn/register-verify — finish passkey enrollment. */
export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  await ensureSeedAdmin(env);
  const auth = await requireStaffOrAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, auth.status, origin);

  let body: { response?: unknown };
  try {
    body = (await request.json()) as { response?: unknown };
  } catch {
    return json({ error: 'Invalid JSON.' }, 400, origin);
  }
  if (!body.response) return json({ error: 'Missing passkey response.' }, 400, origin);

  const verification = await verifyRegistration(request, env, auth.session.username, body.response);
  if (!verification.verified) {
    return json({ error: 'Passkey verification failed. Try again.' }, 400, origin);
  }

  return json({ ok: true }, 200, origin);
}
