import { corsHeaders, json, type Env } from '../../_lib/store';
import {
  createSession,
  displayNameFor,
  ensureSeedAdmin,
  getInvite,
  deleteInvite,
  hashPassword,
  inviteSetupUrl,
  inviteVerifyEmailUrl,
  loadUsers,
  normalizeEmail,
  normalizeUsername,
  saveUsers,
  validateEmail,
  validatePassword,
  validateUsername,
  type StaffUser
} from '../../_lib/staffAuth';
import { toE164Phone } from '../../_lib/sms';
import { isOutgoingCallerIdVerified, isTwilioCallerIdConfigured } from '../../_lib/twilioCallerId';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/** GET /api/staff/invite?token= — public prefill for setup page */
export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (!env.PEERPOINT_KV) {
    return json({ error: 'PEERPOINT_KV is required.' }, 503, origin);
  }
  const url = new URL(request.url);
  const token = (url.searchParams.get('token') ?? '').trim();
  if (!token) return json({ error: 'Invite token is required.' }, 400, origin);

  await ensureSeedAdmin(env);
  const invite = await getInvite(env, token);
  if (!invite) return json({ error: 'Invite not found or expired.' }, 404, origin);

  return json(
    {
      ok: true,
      firstName: invite.firstName,
      lastName: invite.lastName,
      bureau: invite.bureau,
      jobTitle: invite.jobTitle,
      email: invite.email,
      role: invite.role,
      cellPhone: invite.cellPhone,
      emailVerified: Boolean(invite.emailVerifiedAt),
      setupUrl: inviteSetupUrl(token, invite.role),
      verifyEmailUrl: invite.emailVerifiedAt ? undefined : inviteVerifyEmailUrl(token, invite.role)
    },
    200,
    origin
  );
}

/**
 * POST /api/staff/invite — complete registration
 * Body: token, username, password, currentShift, cellPhone, homePhone, workPhone,
 *       personalEmail, workEmail
 */
export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (!env.PEERPOINT_KV) {
    return json({ error: 'PEERPOINT_KV is required.' }, 503, origin);
  }

  let body: {
    token?: string;
    username?: string;
    password?: string;
    currentShift?: string;
    cellPhone?: string;
    homePhone?: string;
    workPhone?: string;
    personalEmail?: string;
    workEmail?: string;
    sex?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON.' }, 400, origin);
  }

  const token = String(body.token ?? '').trim();
  if (!token) return json({ error: 'Invite token is required.' }, 400, origin);

  await ensureSeedAdmin(env);
  const invite = await getInvite(env, token);
  if (!invite) return json({ error: 'Invite not found or expired.' }, 404, origin);
  if (!invite.emailVerifiedAt) {
    return json(
      {
        error:
          'Please verify your email first. Open the verification link from your invite email, then return here to finish registration.'
      },
      403,
      origin
    );
  }

  const username = normalizeUsername(body.username ?? '');
  const userErr = validateUsername(username);
  if (userErr) return json({ error: userErr }, 400, origin);

  const password = String(body.password ?? '');
  const pwErr = validatePassword(password);
  if (pwErr) return json({ error: pwErr }, 400, origin);

  const sexRaw = String(body.sex ?? '').trim().toLowerCase();
  if (sexRaw !== 'male' && sexRaw !== 'female') {
    return json({ error: 'Please select Male or Female (used for member peer preferences).' }, 400, origin);
  }

  const currentShift = String(body.currentShift ?? '').trim();
  const cellPhone = String(body.cellPhone ?? invite.cellPhone ?? '').trim();
  const homePhone = String(body.homePhone ?? '').trim();
  const workPhone = String(body.workPhone ?? '').trim();
  const personalEmail = normalizeEmail(body.personalEmail ?? '');
  const workEmail = normalizeEmail(body.workEmail ?? invite.email);

  if (!currentShift) return json({ error: 'Current shift is required.' }, 400, origin);
  if (!cellPhone) return json({ error: 'Cell phone number is required.' }, 400, origin);
  if (!homePhone) return json({ error: 'Home phone number is required.' }, 400, origin);
  if (!workPhone) return json({ error: 'Work phone number is required.' }, 400, origin);
  const pErr = validateEmail(personalEmail);
  if (pErr) return json({ error: `Personal email: ${pErr}` }, 400, origin);
  const wErr = validateEmail(workEmail);
  if (wErr) return json({ error: `Work email: ${wErr}` }, 400, origin);

  const users = await loadUsers(env);
  if (users.some(u => u.username === username)) {
    return json({ error: 'That username is already taken.' }, 409, origin);
  }
  const emailTaken = users.some(u => {
    const emails = [u.email, u.personalEmail, u.workEmail].map(e => normalizeEmail(e ?? '')).filter(Boolean);
    return (
      emails.includes(invite.email) ||
      emails.includes(personalEmail) ||
      emails.includes(workEmail)
    );
  });
  if (emailTaken) {
    return json({ error: 'An account with that email already exists.' }, 409, origin);
  }

  const { hash, salt } = await hashPassword(password);
  const cellE164 = toE164Phone(cellPhone);
  let twilioVerifiedPhoneE164: string | undefined;
  let twilioVerifiedAt: string | undefined;
  if (cellE164 && isTwilioCallerIdConfigured(env)) {
    const ok = await isOutgoingCallerIdVerified(env, cellE164);
    if (ok) {
      twilioVerifiedPhoneE164 = cellE164;
      twilioVerifiedAt = new Date().toISOString();
    }
  }

  const created: StaffUser = {
    username,
    role: invite.role,
    firstName: invite.firstName,
    lastName: invite.lastName,
    bureau: invite.bureau,
    jobTitle: invite.jobTitle,
    email: invite.email,
    sex: sexRaw,
    personalEmail,
    workEmail,
    currentShift,
    cellPhone,
    homePhone,
    workPhone,
    twilioVerifiedPhoneE164,
    twilioVerifiedAt,
    emailVerifiedAt: invite.emailVerifiedAt,
    displayName: `${invite.firstName} ${invite.lastName}`.trim(),
    passwordHash: hash,
    salt,
    active: true,
    setupComplete: true,
    createdAt: new Date().toISOString(),
    invitedBy: invite.invitedBy
  };

  users.push(created);
  await saveUsers(env, users);
  await deleteInvite(env, token);

  const displayName = displayNameFor(created);
  const session = await createSession(env, {
    role: created.role,
    username: created.username,
    displayName
  });

  return json(
    {
      ok: true,
      token: session.token,
      role: session.session.role,
      username: session.session.username,
      displayName: session.session.displayName
    },
    201,
    origin
  );
}
