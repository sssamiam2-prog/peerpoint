import { corsHeaders, json, type Env } from '../../../_lib/store';
import { displayNameFor, ensureSeedAdmin, loadUsers, requireStaffOrAdmin } from '../../../_lib/staffAuth';
import { createRegistrationOptions } from '../../../_lib/webauthn';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/** POST /api/staff/webauthn/register-options — start passkey enrollment (signed-in). */
export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  await ensureSeedAdmin(env);
  const auth = await requireStaffOrAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, auth.status, origin);

  const users = await loadUsers(env);
  const meUser = users.find(u => u.username === auth.session.username);
  const displayName = auth.session.displayName ?? (meUser ? displayNameFor(meUser) : auth.session.username);

  const { options } = await createRegistrationOptions(request, env, auth.session.username, displayName);
  return json({ ok: true, options }, 200, origin);
}
