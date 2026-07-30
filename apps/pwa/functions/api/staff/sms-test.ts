/**
 * POST /api/staff/sms-test
 * Admin-only smoke test for Twilio join-link SMS.
 * Body: `{ to: string }` — phone to receive a short test message.
 * GET — returns whether Twilio secrets are configured (no secret values).
 */

import { corsHeaders, json, type Env } from '../../_lib/store';
import { isTwilioSmsConfigured, sendTwilioSms, toE164Phone } from '../../_lib/sms';
import { MEMBER_ORIGIN, requireAdmin } from '../../_lib/staffAuth';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const auth = await requireAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, auth.status, origin);
  return json(
    {
      ok: true,
      smsConfigured: isTwilioSmsConfigured(env),
      fromConfigured: Boolean(env.TWILIO_FROM_NUMBER?.trim()),
      message: isTwilioSmsConfigured(env)
        ? 'Twilio SMS secrets are set. Use POST with { to } to send a test text.'
        : 'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER on the Pages project.'
    },
    200,
    origin
  );
}

export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const auth = await requireAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, auth.status, origin);

  let body: { to?: string };
  try {
    body = (await request.json()) as { to?: string };
  } catch {
    return json({ error: 'Invalid JSON.' }, 400, origin);
  }

  const toRaw = (body.to ?? '').trim();
  if (!toRaw) return json({ error: 'Phone number (to) is required.' }, 400, origin);
  if (!toE164Phone(toRaw)) {
    return json({ error: 'Phone number could not be normalized (use a US 10-digit or E.164 number).' }, 400, origin);
  }

  if (!isTwilioSmsConfigured(env)) {
    return json(
      {
        error:
          'SMS is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER on Cloudflare Pages (peer-support-pwa).'
      },
      503,
      origin
    );
  }

  const joinUrl = `${MEMBER_ORIGIN}/staff`;
  const result = await sendTwilioSms(env, {
    to: toRaw,
    body: `PEERPoint SMS test: Twilio is working. Staff sign-in: ${joinUrl}`
  });

  if (!result.ok) {
    return json({ ok: false, error: result.error, smsConfigured: true }, 502, origin);
  }
  if (!result.sent) {
    return json({ ok: false, error: result.reason, smsConfigured: true }, 400, origin);
  }

  const trialNote = result.trialTemplate
    ? ` Twilio trial cannot send custom text yet, so this used template "${result.trialTemplate}" (Twilio’s sample wording). Upgrade Twilio to send real PEERPoint: messages.`
    : '';

  return json(
    {
      ok: true,
      sent: true,
      smsConfigured: true,
      trialTemplate: result.trialTemplate,
      message: `Test SMS sent.${trialNote || ' Check the phone for a PEERPoint SMS test message.'}`
    },
    200,
    origin
  );
}
