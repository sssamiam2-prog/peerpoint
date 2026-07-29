/**
 * Optional SMS via Twilio REST API.
 * Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER (E.164)
 */

import type { Env } from './store';

export type SendSmsResult =
  | { ok: true; sent: true }
  | { ok: true; sent: false; reason: string }
  | { ok: false; error: string };

/** Normalize US-centric phone input to E.164 when possible. */
export function toE164Phone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (raw.trim().startsWith('+') && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

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

  const body = opts.body.trim().slice(0, 1500);
  if (!body) return { ok: true, sent: false, reason: 'Empty SMS body.' };

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
      return { ok: false, error: `Twilio SMS failed (${res.status}): ${errText.slice(0, 200)}` };
    }
    return { ok: true, sent: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
