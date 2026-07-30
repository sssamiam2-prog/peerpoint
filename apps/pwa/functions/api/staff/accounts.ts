import {
  sendEmailVerificationEmail,
  sendInviteEmail
} from '../../_lib/email';
import { corsHeaders, json, type Env } from '../../_lib/store';
import {
  accountVerifyEmailUrl,
  createAccountEmailVerify,
  createInvite,
  deleteInvite,
  displayNameFor,
  getInvite,
  inviteSetupUrl,
  inviteVerifyEmailUrl,
  listPendingInvites,
  loadUsers,
  normalizeEmail,
  normalizeUsername,
  primaryContactEmail,
  requireAdmin,
  saveUsers,
  toPublicAccount,
  validateEmail,
  validatePassword,
  hashPassword,
  type StaffRole
} from '../../_lib/staffAuth';
import { toE164Phone } from '../../_lib/sms';
import { startTwilioVerifyAndEmail } from '../../_lib/twilioVerifyNotify';
import { isOutgoingCallerIdVerified } from '../../_lib/twilioCallerId';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/** GET /api/staff/accounts — Admin only */
export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const auth = await requireAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, auth.status, origin);
  if (!env.PEERPOINT_KV) {
    return json({ error: 'PEERPOINT_KV is required for staff accounts.' }, 503, origin);
  }
  const users = await loadUsers(env);
  const pendingInvites = await listPendingInvites(env);
  return json(
    {
      accounts: users.map(toPublicAccount),
      pendingInvites
    },
    200,
    origin
  );
}

/**
 * POST /api/staff/accounts — invite a Peer Support Member
 * Body: { firstName, lastName, bureau, jobTitle, email, cellPhone, role }
 * Sends email verification; Twilio starts after they verify email.
 */
export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const auth = await requireAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, auth.status, origin);
  if (!env.PEERPOINT_KV) {
    return json({ error: 'PEERPOINT_KV is required for staff accounts.' }, 503, origin);
  }

  let body: {
    firstName?: string;
    lastName?: string;
    bureau?: string;
    jobTitle?: string;
    email?: string;
    cellPhone?: string;
    role?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON.' }, 400, origin);
  }

  const firstName = String(body.firstName ?? '').trim();
  const lastName = String(body.lastName ?? '').trim();
  const bureau = String(body.bureau ?? '').trim();
  const jobTitle = String(body.jobTitle ?? '').trim();
  const email = normalizeEmail(body.email ?? '');
  const cellPhone = String(body.cellPhone ?? '').trim();
  const role: StaffRole = body.role === 'admin' ? 'admin' : body.role === 'staff' ? 'staff' : ('' as StaffRole);

  if (!firstName) return json({ error: 'First name is required.' }, 400, origin);
  if (!lastName) return json({ error: 'Last name is required.' }, 400, origin);
  if (!bureau) return json({ error: 'Bureau is required.' }, 400, origin);
  if (!jobTitle) return json({ error: 'Job title is required.' }, 400, origin);
  const emailErr = validateEmail(email);
  if (emailErr) return json({ error: emailErr }, 400, origin);
  if (!cellPhone) return json({ error: 'Cell phone is required (used for SMS verification after email).' }, 400, origin);
  if (!toE164Phone(cellPhone)) {
    return json({ error: 'Enter a valid US cell phone (10 digits or +1…).' }, 400, origin);
  }
  if (role !== 'admin' && role !== 'staff') {
    return json({ error: 'Access must be Admin or Staff.' }, 400, origin);
  }

  const users = await loadUsers(env);
  if (users.some(u => normalizeEmail(u.email) === email || normalizeEmail(u.workEmail ?? '') === email)) {
    return json({ error: 'An account with that email already exists.' }, 409, origin);
  }
  const pending = await listPendingInvites(env);
  if (pending.some(p => p.email === email)) {
    return json({ error: 'An invite is already pending for that email.' }, 409, origin);
  }

  const invitedBy = auth.session.username;
  const { token, invite } = await createInvite(env, {
    email,
    role,
    firstName,
    lastName,
    bureau,
    jobTitle,
    invitedBy,
    cellPhone
  });
  const verifyUrl = inviteVerifyEmailUrl(token, role);
  const mail = await sendInviteEmail(env, {
    to: email,
    inviteUrl: verifyUrl,
    firstName,
    role
  });

  return json(
    {
      ok: true,
      inviteUrl: verifyUrl,
      setupUrl: inviteSetupUrl(token, role),
      emailed: mail.emailed === true,
      emailNote: mail.emailed ? undefined : 'reason' in mail ? mail.reason : undefined,
      invite: {
        token,
        email: invite.email,
        role: invite.role,
        firstName: invite.firstName,
        lastName: invite.lastName,
        bureau: invite.bureau,
        jobTitle: invite.jobTitle,
        createdAt: invite.createdAt,
        invitedBy: invite.invitedBy,
        cellPhone: invite.cellPhone,
        emailVerified: false
      }
    },
    201,
    origin
  );
}

/**
 * PATCH /api/staff/accounts
 * Pending invite: { inviteToken, resend|revoke|retriggerTwilio }
 * Account: active/role/sex/leader/phones/temporaryPassword
 * Account verify: { username, resendEmailVerification: true }
 * Account Twilio: { username, retriggerTwilioVerify: true }
 */
export async function onRequestPatch({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const auth = await requireAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, auth.status, origin);
  if (!env.PEERPOINT_KV) {
    return json({ error: 'PEERPOINT_KV is required for staff accounts.' }, 503, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON.' }, 400, origin);
  }

  if (typeof body.inviteToken === 'string' && body.inviteToken.trim()) {
    const inviteToken = body.inviteToken.trim();
    const invite = await getInvite(env, inviteToken);
    if (!invite) return json({ error: 'Invite not found or expired.' }, 404, origin);

    if (body.revoke === true) {
      await deleteInvite(env, inviteToken);
      return json({ ok: true }, 200, origin);
    }

    if (body.resend === true) {
      const verifyUrl = inviteVerifyEmailUrl(inviteToken, invite.role);
      const mail = await sendInviteEmail(env, {
        to: invite.email,
        inviteUrl: verifyUrl,
        firstName: invite.firstName,
        role: invite.role
      });
      return json(
        {
          ok: true,
          inviteUrl: verifyUrl,
          emailed: mail.emailed === true,
          emailNote: mail.emailed ? undefined : 'reason' in mail ? mail.reason : undefined
        },
        200,
        origin
      );
    }

    if (body.retriggerTwilio === true) {
      const cell = (invite.cellPhone ?? '').trim();
      if (!cell) return json({ error: 'This invite has no cell phone on file.' }, 400, origin);
      if (!invite.emailVerifiedAt) {
        return json(
          { error: 'Email is not verified yet. Resend the verification email first.' },
          400,
          origin
        );
      }
      const twilio = await startTwilioVerifyAndEmail(env, {
        toEmail: invite.email,
        firstName: invite.firstName,
        phoneRaw: cell,
        continueUrl: inviteSetupUrl(inviteToken, invite.role),
        friendlyName: `${invite.firstName} ${invite.lastName}`.trim()
      });
      return json(
        {
          ok: true,
          twilioVerified: twilio.verified,
          validationCode: twilio.validationCode,
          phoneE164: twilio.phoneE164,
          emailed: twilio.emailed,
          emailNote: twilio.error || twilio.emailNote,
          message: twilio.verified
            ? 'Phone already verified on Twilio.'
            : 'Twilio call started; verification code emailed to the member.'
        },
        200,
        origin
      );
    }

    return json({ error: 'Specify resend, revoke, or retriggerTwilio for inviteToken.' }, 400, origin);
  }

  const username = normalizeUsername(String(body.username ?? ''));
  if (!username) return json({ error: 'username is required.' }, 400, origin);

  const users = await loadUsers(env);
  const idx = users.findIndex(u => u.username === username);
  if (idx < 0) return json({ error: 'Account not found.' }, 404, origin);
  const user = { ...users[idx]! };

  if (body.resendEmailVerification === true) {
    if (username === 'admin') {
      return json({ error: 'Seed Admin does not need email verification.' }, 400, origin);
    }
    const created = await createAccountEmailVerify(env, user);
    if ('error' in created) return json({ error: created.error }, 400, origin);
    const verifyUrl = accountVerifyEmailUrl(created.token, user.role);
    const mail = await sendEmailVerificationEmail(env, {
      to: created.email,
      verifyUrl,
      firstName: user.firstName,
      role: user.role
    });
    return json(
      {
        ok: true,
        emailed: mail.emailed === true,
        emailNote: mail.ok && !mail.emailed ? mail.reason : undefined,
        verifyUrl,
        message: mail.emailed
          ? 'Verification email sent.'
          : 'Could not email — copy the verify link if shown.'
      },
      200,
      origin
    );
  }

  if (body.retriggerTwilioVerify === true) {
    if (username === 'admin') {
      return json({ error: 'Seed Admin does not use SMS matching.' }, 400, origin);
    }
    const cell = (user.cellPhone ?? '').trim();
    if (!cell) {
      return json({ error: 'No cell phone on this account. Set cellPhone first.' }, 400, origin);
    }
    if (!user.emailVerifiedAt) {
      return json(
        { error: 'Email is not verified yet. Use “Resend email verify” first.' },
        400,
        origin
      );
    }
    const continueUrl =
      user.role === 'admin' ? 'https://admin.mypeerpoint.com/' : 'https://mypeerpoint.com/staff';
    const twilio = await startTwilioVerifyAndEmail(env, {
      toEmail: primaryContactEmail(user) || user.email,
      firstName: user.firstName,
      phoneRaw: cell,
      continueUrl,
      friendlyName: displayNameFor(user)
    });
    if (twilio.phoneE164 && (twilio.verified || (await isOutgoingCallerIdVerified(env, twilio.phoneE164)))) {
      user.twilioVerifiedPhoneE164 = twilio.phoneE164;
      user.twilioVerifiedAt = new Date().toISOString();
      users[idx] = user;
      await saveUsers(env, users);
    }
    return json(
      {
        ok: true,
        account: toPublicAccount(user),
        twilioVerified: twilio.verified || Boolean(user.twilioVerifiedPhoneE164),
        validationCode: twilio.validationCode,
        phoneE164: twilio.phoneE164,
        emailed: twilio.emailed,
        emailNote: twilio.error || twilio.emailNote,
        message: twilio.verified
          ? 'Phone already verified on Twilio.'
          : 'Twilio call started; verification code emailed to the member.'
      },
      200,
      origin
    );
  }

  if (typeof body.temporaryPassword === 'string' && body.temporaryPassword.trim()) {
    const pwErr = validatePassword(body.temporaryPassword.trim());
    if (pwErr) return json({ error: pwErr }, 400, origin);
    const { hash, salt } = await hashPassword(body.temporaryPassword.trim());
    user.passwordHash = hash;
    user.salt = salt;
  }

  if (typeof body.active === 'boolean') {
    if (username === 'admin' && body.active === false) {
      return json({ error: 'The seed Admin account cannot be disabled.' }, 400, origin);
    }
    user.active = body.active;
  }

  if (body.role === 'admin' || body.role === 'staff') {
    if (username === 'admin' && body.role !== 'admin') {
      return json({ error: 'The seed Admin account must remain Admin.' }, 400, origin);
    }
    user.role = body.role;
  }

  if (body.sex === 'male' || body.sex === 'female') {
    if (username === 'admin') {
      return json(
        { error: 'The master Admin account is not used for peer matching and does not need Male/Female.' },
        400,
        origin
      );
    }
    user.sex = body.sex;
  }

  if (typeof body.isPeerSupportLeader === 'boolean') {
    if (username === 'admin') {
      return json(
        { error: 'The master Admin account is control-only and is not designated as a Peer Support Leader.' },
        400,
        origin
      );
    }
    user.isPeerSupportLeader = body.isPeerSupportLeader;
  }

  if (typeof body.cellPhone === 'string') {
    user.cellPhone = body.cellPhone.trim();
  }
  if (typeof body.homePhone === 'string') {
    user.homePhone = body.homePhone.trim();
  }
  if (typeof body.workPhone === 'string') {
    user.workPhone = body.workPhone.trim();
  }

  users[idx] = user;
  await saveUsers(env, users);
  return json({ ok: true, account: toPublicAccount(user) }, 200, origin);
}
