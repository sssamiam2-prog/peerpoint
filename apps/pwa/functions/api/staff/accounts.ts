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
  isSeedAdminUsername,
  type StaffRole,
  validateUsername
} from '../../_lib/staffAuth';
import { toE164Phone } from '../../_lib/sms';
import { startTwilioVerifyAndEmail } from '../../_lib/twilioVerifyNotify';
import { isOutgoingCallerIdVerified } from '../../_lib/twilioCallerId';

type Ctx = { request: Request; env: Env };

function suggestUsername(firstName: string, lastName: string, used: Set<string>): string {
  const base = normalizeUsername(`${firstName}.${lastName}`.replace(/[^a-z0-9._-]+/gi, ''));
  const root = (base || 'peer').slice(0, 24);
  if (!used.has(root) && !validateUsername(root)) return root;
  for (let i = 1; i < 1000; i++) {
    const candidate = `${root}${i}`.slice(0, 32);
    if (!used.has(candidate) && !validateUsername(candidate)) return candidate;
  }
  return `${root}${Date.now().toString(36)}`.slice(0, 32);
}

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
 * Or bulk: { bulk: true, invites: [ ...same fields ] } (max 75)
 * Sends email verification; Twilio starts after they verify email.
 */
export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
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

  if (body.bulk === true) {
    const raw = Array.isArray(body.invites) ? body.invites : [];
    if (raw.length === 0) return json({ error: 'No invites provided.' }, 400, origin);
    if (raw.length > 75) return json({ error: 'Bulk invite is limited to 75 rows at a time.' }, 400, origin);

    const users = await loadUsers(env);
    const pending = await listPendingInvites(env);
    const usedEmails = new Set(
      [
        ...users.map(u => normalizeEmail(u.email)),
        ...users.map(u => normalizeEmail(u.workEmail ?? '')),
        ...pending.map(p => normalizeEmail(p.email))
      ].filter(Boolean)
    );

    const results: Array<{
      line?: number;
      email: string;
      ok: boolean;
      error?: string;
      emailed?: boolean;
      inviteUrl?: string;
    }> = [];

    for (const item of raw) {
      const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const line = typeof row.line === 'number' ? row.line : undefined;
      const parsed = parseInviteFields(row);
      if ('error' in parsed) {
        results.push({ line, email: String(row.email ?? ''), ok: false, error: parsed.error });
        continue;
      }
      if (usedEmails.has(parsed.email)) {
        results.push({
          line,
          email: parsed.email,
          ok: false,
          error: 'An account or pending invite already uses that email.'
        });
        continue;
      }
      try {
        const created = await createAndEmailInvite(env, parsed, auth.session.username, body.sendEmail !== false);
        usedEmails.add(parsed.email);
        results.push({
          line,
          email: parsed.email,
          ok: true,
          emailed: created.emailed,
          inviteUrl: created.inviteUrl
        });
      } catch (e) {
        results.push({
          line,
          email: parsed.email,
          ok: false,
          error: e instanceof Error ? e.message : 'Invite failed.'
        });
      }
    }

    const invited = results.filter(r => r.ok).length;
    const failed = results.length - invited;
    return json({ ok: true, invited, failed, results }, 200, origin);
  }

  /** Admin-only: create a ready Staff account with no invite email (for testing / silent setup). */
  if (body.provision === true) {
    const firstName = String(body.firstName ?? '').trim();
    const lastName = String(body.lastName ?? '').trim();
    const bureau = String(body.bureau ?? '').trim() || 'Sheriff’s Office';
    const jobTitle = String(body.jobTitle ?? '').trim() || 'Peer Support';
    const email = normalizeEmail(body.email ?? '');
    const cellPhone = String(body.cellPhone ?? '').trim() || '8015550100';
    const role: StaffRole = body.role === 'admin' ? 'admin' : 'staff';
    const sex = body.sex === 'female' ? 'female' : 'male';
    const employmentClassification =
      body.employmentClassification === 'civilian'
        ? 'civilian'
        : body.employmentClassification === 'sworn'
          ? 'sworn'
          : undefined;
    const emailErr = validateEmail(email);
    if (!firstName || !lastName) return json({ error: 'First and last name are required.' }, 400, origin);
    if (emailErr) return json({ error: emailErr }, 400, origin);

    const users = await loadUsers(env);
    if (users.some(u => normalizeEmail(u.email) === email || normalizeEmail(u.workEmail ?? '') === email)) {
      const existing = users.find(
        u => normalizeEmail(u.email) === email || normalizeEmail(u.workEmail ?? '') === email
      )!;
      if (typeof body.isPeerSupportLeader === 'boolean') {
        existing.isPeerSupportLeader = body.isPeerSupportLeader;
      }
      if (employmentClassification) existing.employmentClassification = employmentClassification;
      existing.active = true;
      existing.setupComplete = true;
      existing.email = email;
      existing.workEmail = email;
      // Staff login identity is email.
      if (existing.username !== email && !isSeedAdminUsername(existing.username)) {
        const taken = users.some(u => u.username === email && u.username !== existing.username);
        if (!taken) existing.username = email;
      }
      const tempPassword = String(body.temporaryPassword ?? '').trim();
      if (tempPassword) {
        const pwErr = validatePassword(tempPassword);
        if (pwErr) return json({ error: pwErr }, 400, origin);
        const { hash, salt } = await hashPassword(tempPassword);
        existing.passwordHash = hash;
        existing.salt = salt;
        existing.mustChangePassword = true;
      }
      await saveUsers(env, users);
      return json(
        {
          ok: true,
          reused: true,
          temporaryPassword: tempPassword || undefined,
          account: toPublicAccount(existing)
        },
        200,
        origin
      );
    }

    const used = new Set(users.map(u => u.username));
    // Default login username is the work email.
    const username = email;
    const userErr = validateUsername(username);
    if (userErr) return json({ error: userErr }, 400, origin);
    if (used.has(username)) return json({ error: 'Username already taken.' }, 409, origin);

    const tempPassword =
      String(body.temporaryPassword ?? '').trim() || `PeerTemp${Math.floor(100000 + Math.random() * 900000)}!`;
    const pwErr = validatePassword(tempPassword);
    if (pwErr) return json({ error: pwErr }, 400, origin);
    const { hash, salt } = await hashPassword(tempPassword);
    const nowIso = new Date().toISOString();
    const created = {
      username,
      role,
      firstName,
      lastName,
      bureau,
      jobTitle,
      email,
      sex: sex as 'male' | 'female',
      employmentClassification,
      workEmail: email,
      currentShift: String(body.currentShift ?? 'Days').trim() || 'Days',
      cellPhone,
      homePhone: cellPhone,
      workPhone: String(body.workPhone ?? cellPhone).trim() || cellPhone,
      passwordHash: hash,
      salt,
      active: true,
      setupComplete: true,
      emailVerifiedAt: nowIso,
      createdAt: nowIso,
      invitedBy: auth.session.username,
      isPeerSupportLeader: body.isPeerSupportLeader === true,
      peerAvailable: true,
      mustChangePassword: true
    };
    users.push(created);
    await saveUsers(env, users);

    // Drop matching pending invite if any
    const pending = await listPendingInvites(env);
    for (const inv of pending) {
      if (normalizeEmail(inv.email) === email) {
        await deleteInvite(env, inv.token);
      }
    }

    return json(
      {
        ok: true,
        provisioned: true,
        temporaryPassword: tempPassword,
        account: toPublicAccount(created)
      },
      201,
      origin
    );
  }

  const parsed = parseInviteFields(body);
  if ('error' in parsed) return json({ error: parsed.error }, 400, origin);

  const users = await loadUsers(env);
  if (users.some(u => normalizeEmail(u.email) === parsed.email || normalizeEmail(u.workEmail ?? '') === parsed.email)) {
    return json({ error: 'An account with that email already exists.' }, 409, origin);
  }
  const pending = await listPendingInvites(env);
  if (pending.some(p => p.email === parsed.email)) {
    return json({ error: 'An invite is already pending for that email.' }, 409, origin);
  }

  const created = await createAndEmailInvite(env, parsed, auth.session.username, body.sendEmail !== false);
  return json(
    {
      ok: true,
      inviteUrl: created.inviteUrl,
      setupUrl: created.setupUrl,
      emailed: created.emailed,
      emailNote: created.emailNote,
      invite: created.invite
    },
    201,
    origin
  );
}

type InviteFields = {
  firstName: string;
  lastName: string;
  bureau: string;
  jobTitle: string;
  email: string;
  cellPhone: string;
  role: StaffRole;
};

function parseInviteFields(body: Record<string, unknown>): InviteFields | { error: string } {
  const firstName = String(body.firstName ?? '').trim();
  const lastName = String(body.lastName ?? '').trim();
  const bureau = String(body.bureau ?? '').trim();
  const jobTitle = String(body.jobTitle ?? '').trim();
  const email = normalizeEmail(body.email ?? '');
  const cellPhone = String(body.cellPhone ?? '').trim();
  const role: StaffRole = body.role === 'admin' ? 'admin' : body.role === 'staff' ? 'staff' : ('' as StaffRole);

  if (!firstName) return { error: 'First name is required.' };
  if (!lastName) return { error: 'Last name is required.' };
  if (!bureau) return { error: 'Bureau is required.' };
  if (!jobTitle) return { error: 'Job title is required.' };
  const emailErr = validateEmail(email);
  if (emailErr) return { error: emailErr };
  if (!cellPhone) return { error: 'Cell phone is required (used for SMS verification after email).' };
  if (!toE164Phone(cellPhone)) return { error: 'Enter a valid US cell phone (10 digits or +1…).' };
  if (role !== 'admin' && role !== 'staff') return { error: 'Access must be Admin or Staff.' };
  return { firstName, lastName, bureau, jobTitle, email, cellPhone, role };
}

async function createAndEmailInvite(
  env: Env,
  fields: InviteFields,
  invitedBy: string,
  sendEmail = true
): Promise<{
  inviteUrl: string;
  setupUrl: string;
  emailed: boolean;
  emailNote?: string;
  invite: Record<string, unknown>;
}> {
  const { token, invite } = await createInvite(env, {
    email: fields.email,
    role: fields.role,
    firstName: fields.firstName,
    lastName: fields.lastName,
    bureau: fields.bureau,
    jobTitle: fields.jobTitle,
    invitedBy,
    cellPhone: fields.cellPhone
  });
  const verifyUrl = inviteVerifyEmailUrl(token, fields.role);
  let emailed = false;
  let emailNote: string | undefined;
  if (sendEmail) {
    const mail = await sendInviteEmail(env, {
      to: fields.email,
      inviteUrl: verifyUrl,
      firstName: fields.firstName,
      role: fields.role
    });
    emailed = mail.emailed === true;
    emailNote = mail.emailed ? undefined : 'reason' in mail ? mail.reason : undefined;
  } else {
    emailNote = 'Invite created without sending email.';
  }
  return {
    inviteUrl: verifyUrl,
    setupUrl: inviteSetupUrl(token, fields.role),
    emailed,
    emailNote,
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
  };
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
  const idx = users.findIndex(
    u =>
      u.username === username ||
      normalizeEmail(u.email) === normalizeEmail(username) ||
      normalizeEmail(u.workEmail ?? '') === normalizeEmail(username)
  );
  if (idx < 0) return json({ error: 'Account not found.' }, 404, origin);
  const user = { ...users[idx]! };

  if (body.permanentDelete === true) {
    if (isSeedAdminUsername(user.username)) {
      return json({ error: 'Built-in master admin accounts cannot be removed.' }, 400, origin);
    }
    const confirmUsername = normalizeUsername(String(body.confirmUsername ?? ''));
    if (!confirmUsername || confirmUsername !== user.username) {
      return json(
        { error: 'Type the member’s exact username to confirm permanent removal.' },
        400,
        origin
      );
    }
    const actor = normalizeUsername(auth.session.username);
    if (
      actor === user.username ||
      (user.email && normalizeEmail(user.email) === normalizeEmail(auth.session.username))
    ) {
      return json({ error: 'You cannot remove your own account while signed in.' }, 400, origin);
    }
    users.splice(idx, 1);
    await saveUsers(env, users);
    return json(
      {
        ok: true,
        removed: user.username,
        displayName: displayNameFor(user),
        message: 'Member permanently removed from PEERPoint.'
      },
      200,
      origin
    );
  }

  if (body.resendEmailVerification === true) {
    if (isSeedAdminUsername(user.username)) {
      return json({ error: 'Master admin accounts do not need email verification.' }, 400, origin);
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
    if (isSeedAdminUsername(user.username)) {
      return json({ error: 'Master admin accounts do not use SMS matching.' }, 400, origin);
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
    user.mustChangePassword = true;
  }

  if (typeof body.email === 'string' && body.email.trim()) {
    const nextEmail = normalizeEmail(body.email);
    const emailErr = validateEmail(nextEmail);
    if (emailErr) return json({ error: emailErr }, 400, origin);
    const conflict = users.some(
      (u, i) =>
        i !== idx &&
        (normalizeEmail(u.email) === nextEmail ||
          normalizeEmail(u.workEmail ?? '') === nextEmail ||
          u.username === nextEmail)
    );
    if (conflict) return json({ error: 'Another account already uses that email.' }, 409, origin);
    user.email = nextEmail;
    user.workEmail = nextEmail;
    if (body.syncUsernameToEmail !== false && !isSeedAdminUsername(user.username)) {
      const userTaken = users.some((u, i) => i !== idx && u.username === nextEmail);
      if (!userTaken) user.username = nextEmail;
    }
  }

  if (typeof body.active === 'boolean') {
    if (isSeedAdminUsername(user.username) && body.active === false) {
      return json({ error: 'Built-in master admin accounts cannot be disabled.' }, 400, origin);
    }
    user.active = body.active;
  }

  if (body.role === 'admin' || body.role === 'staff') {
    if (isSeedAdminUsername(user.username) && body.role !== 'admin') {
      return json({ error: 'Built-in master admin accounts must remain Admin.' }, 400, origin);
    }
    user.role = body.role;
  }

  if (body.sex === 'male' || body.sex === 'female') {
    if (isSeedAdminUsername(user.username)) {
      return json(
        { error: 'Master admin accounts are not used for peer matching and do not need Male/Female.' },
        400,
        origin
      );
    }
    user.sex = body.sex;
  }

  if (typeof body.isPeerSupportLeader === 'boolean') {
    if (isSeedAdminUsername(user.username)) {
      return json(
        { error: 'Master admin accounts are control-only and are not designated as Peer Support Leaders.' },
        400,
        origin
      );
    }
    user.isPeerSupportLeader = body.isPeerSupportLeader;
  }

  if (body.employmentClassification === 'civilian' || body.employmentClassification === 'sworn') {
    user.employmentClassification = body.employmentClassification;
  }
  if (body.employmentClassification === null || body.employmentClassification === '') {
    delete user.employmentClassification;
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
