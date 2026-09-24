import { corsHeaders, json, type Env } from '../../../_lib/store';
import {
  createSession,
  displayNameFor,
  ensureSeedAdmin,
  findUserByUsernameOrEmail,
  isProductionAdminHost,
  loadUsers,
  normalizeUsername
} from '../../../_lib/staffAuth';
import { verifyAuthentication } from '../../../_lib/webauthn';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/** POST /api/staff/webauthn/login-verify — finish biometric sign-in and issue session. */
export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  let body: { username?: string; usernameOrEmail?: string; response?: unknown; rememberMe?: boolean };
  try {
    body = (await request.json()) as {
      username?: string;
      usernameOrEmail?: string;
      response?: unknown;
      rememberMe?: boolean;
    };
  } catch {
    return json({ error: 'Invalid JSON.' }, 400, origin);
  }

  const identity = (body.usernameOrEmail ?? body.username ?? '').trim();
  if (!identity) return json({ error: 'Username or email is required.' }, 400, origin);
  if (!body.response) return json({ error: 'Missing passkey response.' }, 400, origin);

  if (!env.PEERPOINT_KV) {
    return json({ error: 'Accounts storage is not configured.' }, 503, origin);
  }

  await ensureSeedAdmin(env);
  const users = await loadUsers(env);
  const user = findUserByUsernameOrEmail(users, identity);
  if (!user || !user.active || !user.setupComplete) {
    return json({ error: 'Sign-in failed.' }, 401, origin);
  }

  if (isProductionAdminHost(request) && user.role !== 'admin') {
    return json({ error: 'Staff passkey sign-in is on https://mypeerpoint.com/staff.' }, 403, origin);
  }

  const username = normalizeUsername(user.username);
  const verification = await verifyAuthentication(request, env, username, body.response);
  if (!verification.verified) {
    return json({ error: 'Biometric sign-in could not be verified.' }, 401, origin);
  }

  const rememberMe = body.rememberMe !== false;
  const displayName = displayNameFor(user);
  const { token, session } = await createSession(
    env,
    {
      role: user.role,
      username: user.username,
      displayName
    },
    { remember: rememberMe }
  );

  return json(
    {
      ok: true,
      token,
      role: session.role,
      username: session.username,
      displayName: session.displayName,
      mustChangePassword: user.mustChangePassword === true
    },
    200,
    origin
  );
}
