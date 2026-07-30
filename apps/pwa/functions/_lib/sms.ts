/**
 * Optional SMS via Twilio REST API (Twilio.org Programmable Messaging).
 * Cloudflare Pages secrets (not Vite):
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_FROM_NUMBER  — E.164, e.g. +18015551234
 *   TWILIO_TRIAL_SMS_TEMPLATE — optional; default sms_event_notifications
 *
 * All outbound texts are one-way notifications.
 * Upgraded accounts: body always starts with "PEERPoint:".
 * Trial accounts: Twilio only allows predefined template *names* as Body
 * (e.g. sms_event_notifications). Custom PEERPoint copy is not allowed until upgrade.
 * https://www.twilio.com/docs/usage/trials/try-out-sms
 */

import type { Env } from './store';

export type SendSmsResult =
  | { ok: true; sent: true; trialTemplate?: string }
  | { ok: true; sent: false; reason: string }
  | { ok: false; error: string };

const PEERPOINT_SMS_PREFIX = 'PEERPoint:';

/** Twilio trial Body must be one of these template names (not freeform text). */
export const TWILIO_TRIAL_SMS_TEMPLATES = [
  'sms_2fa',
  'sms_appointment_reminders',
  'sms_order_confirmation',
  'sms_delivery_updates',
  'sms_customer_support',
  'sms_marketing_promotions',
  'sms_event_notifications',
  'sms_account_alerts',
  'sms_feedback_surveys',
  'sms_internal_alerts'
] as const;

export function isTwilioSmsConfigured(env: Env): boolean {
  return Boolean(
    env.TWILIO_ACCOUNT_SID?.trim() && env.TWILIO_AUTH_TOKEN?.trim() && env.TWILIO_FROM_NUMBER?.trim()
  );
}

/** Normalize US-centric phone input to E.164 when possible. */
export function toE164Phone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (raw.trim().startsWith('+') && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

/** Ensure every custom SMS opens with PEERPoint (case-insensitive check). */
export function withPeerPointSmsPrefix(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return PEERPOINT_SMS_PREFIX;
  if (/^peerpoint\b/i.test(trimmed)) {
    return trimmed.replace(/^peerpoint\s*[:\-]?\s*/i, `${PEERPOINT_SMS_PREFIX} `).replace(/\s{2,}/g, ' ').trim();
  }
  return `${PEERPOINT_SMS_PREFIX} ${trimmed}`;
}

function trialTemplateName(env: Env): string {
  const raw = (env.TWILIO_TRIAL_SMS_TEMPLATE ?? 'sms_event_notifications').trim();
  if ((TWILIO_TRIAL_SMS_TEMPLATES as readonly string[]).includes(raw)) return raw;
  return 'sms_event_notifications';
}

async function postTwilioMessage(
  sid: string,
  token: string,
  from: string,
  to: string,
  body: string
): Promise<SendSmsResult> {
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
    const auth = btoa(`${sid}:${token}`);
    const form = new URLSearchParams();
    form.set('To', to);
    form.set('From', from);
    form.set('Body', body);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form.toString()
    });
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Twilio SMS failed (${res.status}): ${errText.slice(0, 280)}` };
    }
    return { ok: true, sent: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function isTrialTemplateError(error: string): boolean {
  return error.includes('572006') || /predefined SMS templates/i.test(error);
}

/**
 * Send a one-way notification SMS.
 * Prefers custom PEERPoint body; on Twilio trial (572006), falls back to a predefined template name.
 */
export async function sendTwilioSms(
  env: Env,
  opts: { to: string; body: string }
): Promise<SendSmsResult> {
  const sid = env.TWILIO_ACCOUNT_SID?.trim();
  const token = env.TWILIO_AUTH_TOKEN?.trim();
  const from = env.TWILIO_FROM_NUMBER?.trim();
  if (!sid || !token || !from) {
    return {
      ok: true,
      sent: false,
      reason: 'SMS is not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER).'
    };
  }

  const to = toE164Phone(opts.to);
  if (!to) {
    return { ok: true, sent: false, reason: 'Phone number could not be normalized for SMS.' };
  }

  const customBody = withPeerPointSmsPrefix(opts.body).slice(0, 1500);
  if (!customBody || customBody === PEERPOINT_SMS_PREFIX) {
    return { ok: true, sent: false, reason: 'Empty SMS body.' };
  }

  const first = await postTwilioMessage(sid, token, from, to, customBody);
  if (first.ok && first.sent) return first;
  if (first.ok && !first.sent) return first;

  if (first.ok === false && isTrialTemplateError(first.error)) {
    const tpl = trialTemplateName(env);
    const second = await postTwilioMessage(sid, token, from, to, tpl);
    if (second.ok && second.sent) {
      return { ok: true, sent: true, trialTemplate: tpl };
    }
    return {
      ok: false,
      error:
        second.ok === false
          ? `${second.error} (custom PEERPoint SMS blocked on Twilio trial; fallback template ${tpl} also failed)`
          : first.error
    };
  }

  return first;
}
