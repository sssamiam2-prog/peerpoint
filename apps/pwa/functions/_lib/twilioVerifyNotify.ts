/**
 * Shared helper: start Twilio Caller ID verify and email the keypad code.
 */

import { sendTwilioPhoneVerifyEmail } from './email';
import type { Env } from './store';
import { toE164Phone } from './sms';
import {
  isOutgoingCallerIdVerified,
  isTwilioCallerIdConfigured,
  startOutgoingCallerIdValidation
} from './twilioCallerId';

export type TwilioVerifyNotifyResult = {
  attempted: boolean;
  verified: boolean;
  phoneE164?: string;
  validationCode?: string;
  emailed: boolean;
  emailNote?: string;
  error?: string;
};

export async function startTwilioVerifyAndEmail(
  env: Env,
  opts: {
    toEmail: string;
    firstName: string;
    phoneRaw: string;
    continueUrl: string;
    friendlyName?: string;
  }
): Promise<TwilioVerifyNotifyResult> {
  if (!isTwilioCallerIdConfigured(env)) {
    return {
      attempted: false,
      verified: false,
      emailed: false,
      emailNote: 'Twilio is not configured.'
    };
  }
  const phoneE164 = toE164Phone(opts.phoneRaw);
  if (!phoneE164) {
    return {
      attempted: false,
      verified: false,
      emailed: false,
      error: 'Cell phone could not be normalized for Twilio.'
    };
  }

  if (await isOutgoingCallerIdVerified(env, phoneE164)) {
    const mail = await sendTwilioPhoneVerifyEmail(env, {
      to: opts.toEmail,
      firstName: opts.firstName,
      phoneE164,
      validationCode: '',
      continueUrl: opts.continueUrl,
      alreadyVerified: true
    });
    return {
      attempted: true,
      verified: true,
      phoneE164,
      emailed: mail.ok && mail.emailed === true,
      emailNote: mail.ok && !mail.emailed ? mail.reason : undefined
    };
  }

  const started = await startOutgoingCallerIdValidation(env, phoneE164, opts.friendlyName);
  if (!started.ok) {
    return {
      attempted: true,
      verified: false,
      phoneE164,
      emailed: false,
      error: started.error
    };
  }
  if (started.alreadyVerified) {
    const mail = await sendTwilioPhoneVerifyEmail(env, {
      to: opts.toEmail,
      firstName: opts.firstName,
      phoneE164: started.phoneE164,
      validationCode: '',
      continueUrl: opts.continueUrl,
      alreadyVerified: true
    });
    return {
      attempted: true,
      verified: true,
      phoneE164: started.phoneE164,
      emailed: mail.ok && mail.emailed === true,
      emailNote: mail.ok && !mail.emailed ? mail.reason : undefined
    };
  }

  const mail = await sendTwilioPhoneVerifyEmail(env, {
    to: opts.toEmail,
    firstName: opts.firstName,
    phoneE164: started.phoneE164,
    validationCode: started.validationCode,
    continueUrl: opts.continueUrl
  });
  return {
    attempted: true,
    verified: false,
    phoneE164: started.phoneE164,
    validationCode: started.validationCode,
    emailed: mail.ok && mail.emailed === true,
    emailNote: mail.ok && !mail.emailed ? mail.reason : undefined
  };
}
