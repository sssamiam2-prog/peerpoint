import { sendPasswordResetEmail } from '../../_lib/email';
import { corsHeaders, json, type Env } from '../../_lib/store';
import {
  createPasswordReset,
  ensureSeedAdmin,
  findUserByUsernameOrEmail,
  loadUsers,
  passwordResetUrl
} from '../../_lib/staffAuth';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

const GENERIC_OK =
  'If an account matches that username or email, we sent a password reset link. Check your inbox (and spam). The link expires in 1 hour.';

/**
 * POST /api/staff/forgot-password
 * Body: `{ usernameOrEmail }`
 * Always returns a generic success when lookup fails (no account enumeration).
 */
export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  let body: { usernameOrEmail?: string };
  try {
    body = (await request.json()) as { usernameOrEmail?: string };
  } catch {
    return json({ error: 'Invalid JSON.' }, 400, origin);
  }

  const usernameOrEmail = (body.usernameOrEmail ?? '').trim();
  if (!usernameOrEmail) {
    return json({ error: 'Username or email is required.' }, 400, origin);
  }

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

  if (!env.RESEND_API_KEY?.trim() || !env.INVITE_FROM_EMAIL?.trim()) {
    return json(
      {
        error:
          'Password reset email is not configured. Ask an Admin to set your password, or contact Peer Support leadership.'
      },
      503,
      origin
    );
  }

  await ensureSeedAdmin(env);
  const users = await loadUsers(env);
  const user = findUserByUsernameOrEmail(users, usernameOrEmail);

  if (user?.active && user.setupComplete) {
    const created = await createPasswordReset(env, user);
    if (!('error' in created)) {
      const mail = await sendPasswordResetEmail(env, {
        to: created.email,
        resetUrl: passwordResetUrl(created.token, created.reset.role),
        firstName: user.firstName,
        role: user.role
      });
      if (!mail.ok) {
        return json({ error: mail.error }, 502, origin);
      }
      // If Resend is configured but send failed soft (emailed:false), still return generic OK
      // so we do not leak whether the account exists. Ops can check Resend logs.
    }
  }

  return json({ ok: true, message: GENERIC_OK }, 200, origin);
}
