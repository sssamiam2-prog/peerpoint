/**
 * GET/POST /api/staff/verify-email
 *
 * Invite flow: ?token= (invite token) — marks email verified, then starts Twilio + emails code.
 * Account flow: ?accountToken= — same for existing members (Admin retrigger).
 */

import { corsHeaders, json, type Env } from '../../_lib/store';
import {
  deleteAccountEmailVerify,
  displayNameFor,
  getAccountEmailVerify,
  getInvite,
  inviteSetupUrl,
  loadUsers,
  saveInvite,
  saveUsers
} from '../../_lib/staffAuth';
import { toE164Phone } from '../../_lib/sms';
import { startTwilioVerifyAndEmail } from '../../_lib/twilioVerifyNotify';
import { isOutgoingCallerIdVerified } from '../../_lib/twilioCallerId';

type Ctx = { request: Request; env: Env };

type VerifyOk = {
  ok: true;
  kind: 'invite' | 'account';
  alreadyVerified: boolean;
  email: string;
  firstName: string;
  role: 'admin' | 'staff';
  username?: string;
  setupUrl: string;
  cellPhone?: string;
  phoneE164?: string;
  twilioVerified: boolean;
  validationCode?: string;
  twilioEmailed: boolean;
  twilioNote?: string;
  message: string;
};

type VerifyErr = { error: string; status: number };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

async function confirmInviteEmail(env: Env, token: string): Promise<VerifyOk | VerifyErr> {
  const invite = await getInvite(env, token);
  if (!invite) return { error: 'Invite not found or expired.', status: 404 };

  const already = Boolean(invite.emailVerifiedAt);
  if (!invite.emailVerifiedAt) {
    invite.emailVerifiedAt = new Date().toISOString();
    await saveInvite(env, token, invite);
  }

  const setupUrl = inviteSetupUrl(token, invite.role);
  const cell = (invite.cellPhone ?? '').trim();
  let twilio: Awaited<ReturnType<typeof startTwilioVerifyAndEmail>> | undefined;

  if (cell) {
    twilio = await startTwilioVerifyAndEmail(env, {
      toEmail: invite.email,
      firstName: invite.firstName,
      phoneRaw: cell,
      continueUrl: setupUrl,
      friendlyName: `${invite.firstName} ${invite.lastName}`.trim()
    });
  }

  return {
    ok: true,
    kind: 'invite',
    alreadyVerified: already,
    email: invite.email,
    firstName: invite.firstName,
    role: invite.role,
    setupUrl,
    cellPhone: cell || undefined,
    phoneE164: twilio?.phoneE164 ?? toE164Phone(cell) ?? undefined,
    twilioVerified: twilio?.verified === true,
    validationCode: twilio?.validationCode,
    twilioEmailed: twilio?.emailed === true,
    twilioNote: twilio?.error || twilio?.emailNote,
    message: already
      ? 'Email was already verified.'
      : 'Email verified. Next: answer the Twilio call (if started), then finish registration.'
  };
}

async function confirmAccountEmail(env: Env, accountToken: string): Promise<VerifyOk | VerifyErr> {
  const record = await getAccountEmailVerify(env, accountToken);
  if (!record) return { error: 'Verification link is invalid or expired.', status: 404 };

  const users = await loadUsers(env);
  const idx = users.findIndex(u => u.username === record.username);
  if (idx < 0) return { error: 'Account not found.', status: 404 };

  const user = users[idx]!;
  const already = Boolean(user.emailVerifiedAt);
  user.emailVerifiedAt = user.emailVerifiedAt || new Date().toISOString();

  const cell = (user.cellPhone ?? '').trim();
  const continueUrl =
    user.role === 'admin' ? 'https://admin.mypeerpoint.com/' : 'https://mypeerpoint.com/staff';

  let twilio: Awaited<ReturnType<typeof startTwilioVerifyAndEmail>> | undefined;
  if (cell) {
    twilio = await startTwilioVerifyAndEmail(env, {
      toEmail: record.email,
      firstName: user.firstName,
      phoneRaw: cell,
      continueUrl,
      friendlyName: displayNameFor(user)
    });
    if (twilio.phoneE164 && (twilio.verified || (await isOutgoingCallerIdVerified(env, twilio.phoneE164)))) {
      user.twilioVerifiedPhoneE164 = twilio.phoneE164;
      user.twilioVerifiedAt = new Date().toISOString();
      twilio = { ...twilio, verified: true };
    }
  }

  users[idx] = user;
  await saveUsers(env, users);
  await deleteAccountEmailVerify(env, accountToken);

  return {
    ok: true,
    kind: 'account',
    alreadyVerified: already,
    email: record.email,
    firstName: user.firstName,
    role: user.role,
    username: user.username,
    setupUrl: continueUrl,
    cellPhone: cell || undefined,
    phoneE164: twilio?.phoneE164 ?? toE164Phone(cell) ?? undefined,
    twilioVerified: twilio?.verified === true || Boolean(user.twilioVerifiedPhoneE164),
    validationCode: twilio?.validationCode,
    twilioEmailed: twilio?.emailed === true,
    twilioNote: twilio?.error || twilio?.emailNote,
    message: already
      ? 'Email was already verified. Phone verification was retriggered if a cell is on file.'
      : 'Email verified. Check your phone for a Twilio call and the code email.'
  };
}

export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (!env.PEERPOINT_KV) {
    return json({ error: 'PEERPOINT_KV is required.' }, 503, origin);
  }
  const url = new URL(request.url);
  const token = (url.searchParams.get('token') ?? '').trim();
  const accountToken = (url.searchParams.get('accountToken') ?? '').trim();

  if (accountToken) {
    const result = await confirmAccountEmail(env, accountToken);
    if ('error' in result) return json({ error: result.error }, result.status, origin);
    return json(result, 200, origin);
  }
  if (!token) return json({ error: 'Verification token is required.' }, 400, origin);

  const result = await confirmInviteEmail(env, token);
  if ('error' in result) return json({ error: result.error }, result.status, origin);
  return json(result, 200, origin);
}

export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (!env.PEERPOINT_KV) {
    return json({ error: 'PEERPOINT_KV is required.' }, 503, origin);
  }
  let body: { token?: string; accountToken?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON.' }, 400, origin);
  }
  const accountToken = String(body.accountToken ?? '').trim();
  const token = String(body.token ?? '').trim();
  if (accountToken) {
    const result = await confirmAccountEmail(env, accountToken);
    if ('error' in result) return json({ error: result.error }, result.status, origin);
    return json(result, 200, origin);
  }
  if (!token) return json({ error: 'Verification token is required.' }, 400, origin);
  const result = await confirmInviteEmail(env, token);
  if ('error' in result) return json({ error: result.error }, result.status, origin);
  return json(result, 200, origin);
}
