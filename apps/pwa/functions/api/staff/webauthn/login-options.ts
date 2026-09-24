import { corsHeaders, json, type Env } from '../../../_lib/store';
import {
  ensureSeedAdmin,
  findUserByUsernameOrEmail,
  isProductionAdminHost,
  loadUsers,
  normalizeUsername
} from '../../../_lib/staffAuth';
import { createAuthenticationOptions } from '../../../_lib/webauthn';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/** POST /api/staff/webauthn/login-options — begin biometric sign-in. */
export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  let body: { username?: string; usernameOrEmail?: string };
  try {
    body = (await request.json()) as { username?: string; usernameOrEmail?: string };
  } catch {
    return json({ error: 'Invalid JSON.' }, 400, origin);
  }

  const identity = (body.usernameOrEmail ?? body.username ?? '').trim();
  if (!identity) return json({ error: 'Username or email is required.' }, 400, origin);

  if (!env.PEERPOINT_KV) {
    return json({ error: 'Accounts storage is not configured.' }, 503, origin);
  }

  await ensureSeedAdmin(env);
  const users = await loadUsers(env);
  const user = findUserByUsernameOrEmail(users, identity);
  if (!user || !user.active || !user.setupComplete) {
    return json({ error: 'No passkey found for this account.' }, 401, origin);
  }

  if (isProductionAdminHost(request) && user.role !== 'admin') {
    return json({ error: 'Use mypeerpoint.com for staff passkey sign-in.' }, 403, origin);
  }

  const username = normalizeUsername(user.username);
  const authOpts = await createAuthenticationOptions(request, env, username);
  if (!authOpts) {
    return json({ error: 'No passkey registered for this account. Sign in with password first, then enable biometric sign-in under Account.' }, 404, origin);
  }

  return json({ ok: true, options: authOpts.options }, 200, origin);
}
