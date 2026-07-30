/**
 * Twilio Outgoing Caller ID / Verified Recipient helpers (trial SMS allow-list).
 *
 * Twilio's public API starts a **voice call** verification: the person answers and
 * enters the validation code on the phone keypad. Console also offers SMS verify,
 * but that path is not exposed on the REST ValidationRequests API.
 */

import type { Env } from './store';
import { isTwilioSmsConfigured, toE164Phone } from './sms';

export type StartCallerIdValidationResult =
  | { ok: true; alreadyVerified: true; phoneE164: string }
  | { ok: true; alreadyVerified: false; phoneE164: string; validationCode: string; callSid?: string }
  | { ok: false; error: string };

function twilioAuthHeader(sid: string, token: string): string {
  return `Basic ${btoa(`${sid}:${token}`)}`;
}

function twilioCredentials(env: Env): { sid: string; token: string } | null {
  const sid = env.TWILIO_ACCOUNT_SID?.trim();
  const token = env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) return null;
  return { sid, token };
}

/** True when Account SID + Auth Token are set (From number not required for Caller ID verify). */
export function isTwilioCallerIdConfigured(env: Env): boolean {
  return Boolean(twilioCredentials(env));
}

export async function listOutgoingCallerIdPhones(env: Env): Promise<string[]> {
  const creds = twilioCredentials(env);
  if (!creds) return [];
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(creds.sid)}/OutgoingCallerIds.json?PageSize=1000`;
    const res = await fetch(url, {
      headers: { Authorization: twilioAuthHeader(creds.sid, creds.token) }
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { outgoing_caller_ids?: Array<{ phone_number?: string }> };
    const phones: string[] = [];
    for (const row of data.outgoing_caller_ids ?? []) {
      const e164 = toE164Phone(String(row.phone_number ?? ''));
      if (e164) phones.push(e164);
    }
    return phones;
  } catch {
    return [];
  }
}

export async function isOutgoingCallerIdVerified(env: Env, phoneRaw: string): Promise<boolean> {
  const target = toE164Phone(phoneRaw);
  if (!target) return false;
  const list = await listOutgoingCallerIdPhones(env);
  return list.includes(target);
}

/**
 * Start Twilio Caller ID validation (places a call). Returns the code the callee
 * must enter on the keypad, or alreadyVerified if on the account allow-list.
 */
export async function startOutgoingCallerIdValidation(
  env: Env,
  phoneRaw: string,
  friendlyName?: string
): Promise<StartCallerIdValidationResult> {
  const creds = twilioCredentials(env);
  if (!creds) {
    return { ok: false, error: 'Twilio is not configured (set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN).' };
  }
  const phoneE164 = toE164Phone(phoneRaw);
  if (!phoneE164) {
    return { ok: false, error: 'Enter a valid US phone number (10 digits or +1…).' };
  }

  if (await isOutgoingCallerIdVerified(env, phoneE164)) {
    return { ok: true, alreadyVerified: true, phoneE164 };
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(creds.sid)}/OutgoingCallerIds.json`;
    const form = new URLSearchParams();
    form.set('PhoneNumber', phoneE164);
    if (friendlyName?.trim()) form.set('FriendlyName', friendlyName.trim().slice(0, 64));

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: twilioAuthHeader(creds.sid, creds.token),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form.toString()
    });
    const raw = await res.text();
    let parsed: {
      validation_code?: string;
      call_sid?: string;
      phone_number?: string;
      message?: string;
      code?: number;
    } = {};
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      /* keep empty */
    }
    if (!res.ok) {
      const msg = parsed.message || raw.slice(0, 200) || `Twilio error ${res.status}`;
      return { ok: false, error: msg };
    }
    const validationCode = String(parsed.validation_code ?? '').trim();
    if (!validationCode) {
      return { ok: false, error: 'Twilio did not return a validation code. Try again.' };
    }
    return {
      ok: true,
      alreadyVerified: false,
      phoneE164: toE164Phone(String(parsed.phone_number ?? phoneE164)) ?? phoneE164,
      validationCode,
      callSid: parsed.call_sid
    };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Soft hint for UIs when SMS is configured but number not yet on Twilio allow-list. */
export function twilioTrialVerifyHint(env: Env): string | undefined {
  if (!isTwilioSmsConfigured(env) && !isTwilioCallerIdConfigured(env)) return undefined;
  return 'Twilio will call this number. Answer and enter the code shown in the app on your phone keypad.';
}
