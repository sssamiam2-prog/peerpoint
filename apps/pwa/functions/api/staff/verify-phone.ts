/**
 * GET/POST /api/staff/verify-phone
 *
 * Starts Twilio Outgoing Caller ID verification (voice call + keypad code) so a
 * staff cell can receive trial SMS. Auth: Bearer session OR valid inviteToken.
 */

import { corsHeaders, json, type Env } from '../../_lib/store';
import {
  displayNameFor,
  getInvite,
  loadUsers,
  requireStaffOrAdmin,
  saveUsers
} from '../../_lib/staffAuth';
import { toE164Phone } from '../../_lib/sms';
import {
  isOutgoingCallerIdVerified,
  isTwilioCallerIdConfigured,
  startOutgoingCallerIdValidation,
  twilioTrialVerifyHint
} from '../../_lib/twilioCallerId';

type Ctx = { request: Request; env: Env };

async function authorizeInviteOrSession(
  request: Request,
  env: Env,
  inviteToken: string | undefined
): Promise<
  | { kind: 'session'; username: string }
  | { kind: 'invite'; token: string }
  | { error: string; status: number }
> {
  const token = (inviteToken ?? '').trim();
  if (token) {
    const invite = await getInvite(env, token);
    if (!invite) return { error: 'Invite not found or expired.', status: 404 };
    return { kind: 'invite', token };
  }
  const auth = await requireStaffOrAdmin(request, env);
  if ('error' in auth) return { error: auth.error, status: auth.status };
  return { kind: 'session', username: auth.session.username };
}

async function persistVerifiedForUser(
  env: Env,
  username: string,
  phoneE164: string,
  cellPhoneDisplay?: string
): Promise<void> {
  const users = await loadUsers(env);
  const idx = users.findIndex(u => u.username === username);
  if (idx < 0) return;
  const u = users[idx]!;
  u.twilioVerifiedPhoneE164 = phoneE164;
  u.twilioVerifiedAt = new Date().toISOString();
  if (cellPhoneDisplay?.trim()) u.cellPhone = cellPhoneDisplay.trim();
  else if (!u.cellPhone?.trim()) u.cellPhone = phoneE164;
  users[idx] = u;
  await saveUsers(env, users);
}

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/** GET — status for current staff session, or ?inviteToken=&phone= during setup. */
export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (!env.PEERPOINT_KV) {
    return json({ error: 'PEERPOINT_KV is required.' }, 503, origin);
  }

  const url = new URL(request.url);
  const inviteToken = (url.searchParams.get('inviteToken') ?? '').trim();
  const phoneQ = (url.searchParams.get('phone') ?? '').trim();

  const authz = await authorizeInviteOrSession(request, env, inviteToken || undefined);
  if ('error' in authz) return json({ error: authz.error }, authz.status, origin);

  const configured = isTwilioCallerIdConfigured(env);
  let cellPhone = phoneQ;
  let storedVerified = false;

  if (authz.kind === 'session') {
    const users = await loadUsers(env);
    const me = users.find(u => u.username === authz.username);
    if (!cellPhone) cellPhone = (me?.cellPhone ?? '').trim();
    const e164 = toE164Phone(cellPhone) ?? '';
    storedVerified = Boolean(
      me?.twilioVerifiedPhoneE164 && e164 && me.twilioVerifiedPhoneE164 === e164
    );
  }

  const phoneE164 = toE164Phone(cellPhone);
  let verified = storedVerified;
  if (configured && phoneE164) {
    verified = await isOutgoingCallerIdVerified(env, phoneE164);
    if (verified && authz.kind === 'session' && !storedVerified) {
      await persistVerifiedForUser(env, authz.username, phoneE164, cellPhone);
    }
  }

  return json(
    {
      ok: true,
      configured,
      cellPhone: cellPhone || undefined,
      phoneE164: phoneE164 || undefined,
      verified,
      hint: twilioTrialVerifyHint(env)
    },
    200,
    origin
  );
}

/**
 * POST body:
 *   { action: 'start' | 'check', phone: string, inviteToken?: string }
 */
export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (!env.PEERPOINT_KV) {
    return json({ error: 'PEERPOINT_KV is required.' }, 503, origin);
  }

  let body: { action?: string; phone?: string; inviteToken?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON.' }, 400, origin);
  }

  const action = String(body.action ?? '').trim().toLowerCase();
  const phone = String(body.phone ?? '').trim();
  const inviteToken = String(body.inviteToken ?? '').trim();

  const authz = await authorizeInviteOrSession(request, env, inviteToken || undefined);
  if ('error' in authz) return json({ error: authz.error }, authz.status, origin);

  if (!isTwilioCallerIdConfigured(env)) {
    return json(
      {
        error:
          'Twilio is not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN on Cloudflare Pages.'
      },
      503,
      origin
    );
  }

  if (!phone) return json({ error: 'Phone number is required.' }, 400, origin);
  const phoneE164 = toE164Phone(phone);
  if (!phoneE164) {
    return json({ error: 'Enter a valid US phone number (10 digits or +1…).' }, 400, origin);
  }

  if (action === 'check') {
    const verified = await isOutgoingCallerIdVerified(env, phoneE164);
    if (verified && authz.kind === 'session') {
      await persistVerifiedForUser(env, authz.username, phoneE164, phone);
    }
    return json(
      {
        ok: true,
        verified,
        phoneE164,
        message: verified
          ? 'Phone verified on Twilio. Trial SMS can be sent to this number.'
          : 'Not verified yet. Answer the Twilio call and enter the code on your keypad, then check again.'
      },
      200,
      origin
    );
  }

  if (action !== 'start') {
    return json({ error: 'action must be "start" or "check".' }, 400, origin);
  }

  const friendly =
    authz.kind === 'session'
      ? displayNameFor(
          (await loadUsers(env)).find(u => u.username === authz.username) ?? {
            firstName: '',
            lastName: '',
            username: authz.username
          }
        )
      : 'PEERPoint staff';

  const started = await startOutgoingCallerIdValidation(env, phone, friendly);
  if (!started.ok) return json({ error: started.error }, 502, origin);

  if (started.alreadyVerified) {
    if (authz.kind === 'session') {
      await persistVerifiedForUser(env, authz.username, started.phoneE164, phone);
    }
    return json(
      {
        ok: true,
        alreadyVerified: true,
        verified: true,
        phoneE164: started.phoneE164,
        message: 'This number is already verified on Twilio.'
      },
      200,
      origin
    );
  }

  return json(
    {
      ok: true,
      alreadyVerified: false,
      verified: false,
      phoneE164: started.phoneE164,
      validationCode: started.validationCode,
      callSid: started.callSid,
      message:
        'Twilio is calling this number now. Answer and enter the code below on your phone keypad.',
      hint: twilioTrialVerifyHint(env)
    },
    200,
    origin
  );
}
