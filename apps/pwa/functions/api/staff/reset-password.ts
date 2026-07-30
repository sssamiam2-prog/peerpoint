import { corsHeaders, json, type Env } from '../../_lib/store';
import {
  deletePasswordReset,
  getPasswordReset,
  hashPassword,
  loadUsers,
  saveUsers,
  validatePassword
} from '../../_lib/staffAuth';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/**
 * GET /api/staff/reset-password?token=
 * Validates a reset token and returns username/role for the UI.
 */
export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  const token = (url.searchParams.get('token') ?? '').trim();
  if (!token) return json({ error: 'Missing reset token.' }, 400, origin);

  if (!env.PEERPOINT_KV) {
    return json({ error: 'PEERPOINT_KV is required.' }, 503, origin);
  }

  const reset = await getPasswordReset(env, token);
  if (!reset) {
    return json({ error: 'Reset link is invalid or expired. Request a new one from the sign-in page.' }, 404, origin);
  }

  return json(
    {
      ok: true,
      username: reset.username,
      role: reset.role,
      email: reset.email
    },
    200,
    origin
  );
}

/**
 * POST /api/staff/reset-password
 * Body: `{ token, password }`
 */
export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  let body: { token?: string; password?: string };
  try {
    body = (await request.json()) as { token?: string; password?: string };
  } catch {
    return json({ error: 'Invalid JSON.' }, 400, origin);
  }

  const token = (body.token ?? '').trim();
  const password = (body.password ?? '').trim();
  if (!token) return json({ error: 'Missing reset token.' }, 400, origin);

  const pwErr = validatePassword(password);
  if (pwErr) return json({ error: pwErr }, 400, origin);

  if (!env.PEERPOINT_KV) {
    return json({ error: 'PEERPOINT_KV is required.' }, 503, origin);
  }

  const reset = await getPasswordReset(env, token);
  if (!reset) {
    return json({ error: 'Reset link is invalid or expired. Request a new one from the sign-in page.' }, 404, origin);
  }

  const users = await loadUsers(env);
  const idx = users.findIndex(u => u.username === reset.username);
  if (idx < 0) {
    await deletePasswordReset(env, token);
    return json({ error: 'Account not found.' }, 404, origin);
  }
  const user = users[idx]!;
  if (!user.active || !user.setupComplete) {
    await deletePasswordReset(env, token);
    return json({ error: 'Account is not active.' }, 403, origin);
  }

  const { hash, salt } = await hashPassword(password);
  users[idx] = { ...user, passwordHash: hash, salt };
  await saveUsers(env, users);
  await deletePasswordReset(env, token);

  return json(
    {
      ok: true,
      username: user.username,
      role: user.role,
      message: 'Password updated. You can sign in with your new password.'
    },
    200,
    origin
  );
}
