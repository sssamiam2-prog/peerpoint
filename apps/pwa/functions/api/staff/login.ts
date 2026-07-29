import { corsHeaders, json, type Env } from '../../_lib/store';
import {
  createSession,
  displayNameFor,
  ensureSeedAdmin,
  isProductionAdminHost,
  loadUsers,
  normalizeUsername,
  verifyPassword
} from '../../_lib/staffAuth';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/**
 * POST /api/staff/login
 * Body: `{ username, password }`
 * - Admin host (production): only Admin-role accounts
 * - Main host: Staff or Admin
 */
export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  let body: { username?: string; password?: string };
  try {
    body = (await request.json()) as { username?: string; password?: string };
  } catch {
    return json({ error: 'Invalid JSON.' }, 400, origin);
  }

  const password = (body.password ?? '').trim();
  const username = normalizeUsername(body.username ?? '');
  if (!username) return json({ error: 'Username is required.' }, 400, origin);
  if (!password) return json({ error: 'Password is required.' }, 400, origin);

  if (!env.PEERPOINT_KV) {
    return json(
      {
        error:
          'PEERPOINT_KV is required for accounts. Bind a KV namespace named PEERPOINT_KV on the Pages project.'
      },
      503,
      origin
    );
  }

  await ensureSeedAdmin(env);
  const users = await loadUsers(env);
  const user = users.find(u => u.username === username);
  if (!user || !user.active || !user.setupComplete) {
    return json({ error: 'Invalid username or password.' }, 401, origin);
  }

  if (isProductionAdminHost(request) && user.role !== 'admin') {
    return json(
      {
        error:
          'Staff sign-in is on https://mypeerpoint.com/staff. This Admin site is for Admin accounts only.'
      },
      403,
      origin
    );
  }

  const ok = await verifyPassword(password, user.salt, user.passwordHash);
  if (!ok) return json({ error: 'Invalid username or password.' }, 401, origin);

  const displayName = displayNameFor(user);
  const { token, session } = await createSession(env, {
    role: user.role,
    username: user.username,
    displayName
  });

  return json(
    {
      ok: true,
      token,
      role: session.role,
      username: session.username,
      displayName: session.displayName
    },
    200,
    origin
  );
}
