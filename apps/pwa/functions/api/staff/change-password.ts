import { corsHeaders, json, type Env } from '../../_lib/store';
import {
  hashPassword,
  loadUsers,
  requireSession,
  saveUsers,
  validatePassword,
  verifyPassword
} from '../../_lib/staffAuth';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/**
 * POST /api/staff/change-password
 * Named Admin or Staff: change own password with currentPassword.
 */
export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const auth = await requireSession(request, env);
  if ('error' in auth) return json({ error: auth.error }, auth.status, origin);

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = (await request.json()) as { currentPassword?: string; newPassword?: string };
  } catch {
    return json({ error: 'Invalid JSON.' }, 400, origin);
  }

  const currentPassword = (body.currentPassword ?? '').trim();
  const newPassword = (body.newPassword ?? '').trim();
  const pwErr = validatePassword(newPassword);
  if (pwErr) return json({ error: pwErr }, 400, origin);
  if (!currentPassword) return json({ error: 'Current password is required.' }, 400, origin);

  if (!env.PEERPOINT_KV) {
    return json({ error: 'PEERPOINT_KV is required.' }, 503, origin);
  }

  const username = auth.session.username;
  if (!username) return json({ error: 'Invalid session.' }, 401, origin);

  const users = await loadUsers(env);
  const idx = users.findIndex(u => u.username === username);
  if (idx < 0) return json({ error: 'Account not found.' }, 404, origin);
  const user = users[idx]!;

  const ok = await verifyPassword(currentPassword, user.salt, user.passwordHash);
  if (!ok) return json({ error: 'Current password is incorrect.' }, 401, origin);

  const { hash, salt } = await hashPassword(newPassword);
  users[idx] = { ...user, passwordHash: hash, salt };
  await saveUsers(env, users);
  return json({ ok: true }, 200, origin);
}
