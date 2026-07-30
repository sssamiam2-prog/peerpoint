/**
 * Transactional email via Resend HTTPS API.
 * https://resend.com/docs/api-reference/emails/send-email
 */

import type { Env } from './store';
import { MEMBER_ORIGIN } from './staffAuth';

export type SendEmailResult =
  | { ok: true; emailed: true }
  | { ok: true; emailed: false; reason: string }
  | { ok: false; error: string };

export type SendInviteResult = SendEmailResult;

const BRAND_GREEN = '#1b3a2f';
const BRAND_ACCENT = '#0f6a4a';
const LOGO_URL = `${MEMBER_ORIGIN}/peerpoint-logo.png`;

async function sendResendEmail(
  env: Env,
  opts: { to: string; subject: string; text: string; html: string }
): Promise<SendEmailResult> {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.INVITE_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    return {
      ok: true,
      emailed: false,
      reason: 'Email is not configured (set RESEND_API_KEY and INVITE_FROM_EMAIL).'
    };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
        html: opts.html
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      return {
        ok: true,
        emailed: false,
        reason: `Email send failed (${res.status}): ${errText.slice(0, 180)}.`
      };
    }
    return { ok: true, emailed: true };
  } catch (e) {
    return {
      ok: true,
      emailed: false,
      reason: `Email send error: ${e instanceof Error ? e.message : 'unknown'}.`
    };
  }
}

function emailButton(href: string, label: string, primary = true): string {
  const bg = primary ? BRAND_ACCENT : '#ffffff';
  const color = primary ? '#ffffff' : BRAND_GREEN;
  const border = primary ? BRAND_ACCENT : BRAND_GREEN;
  return `<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;margin:4px 8px 4px 0;background:${bg};color:${color};border:2px solid ${border};border-radius:8px;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;line-height:1.2">${escapeHtml(label)}</a>`;
}

function brandedEmailShell(opts: {
  title: string;
  greetingHtml: string;
  bodyHtml: string;
  buttonsHtml: string;
  footerNoteHtml?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#eef3ef;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3ef;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #d5e0d8">
        <tr>
          <td style="background:${BRAND_GREEN};padding:20px 24px;text-align:center">
            <img src="${escapeHtml(LOGO_URL)}" alt="PEERPoint" width="160" style="display:block;margin:0 auto;max-width:160px;height:auto;border:0" />
          </td>
        </tr>
        <tr>
          <td style="padding:28px 24px 8px">
            <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${BRAND_GREEN}">${escapeHtml(opts.title)}</h1>
            ${opts.greetingHtml}
            ${opts.bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 24px 24px;text-align:left">
            ${opts.buttonsHtml}
          </td>
        </tr>
        ${
          opts.footerNoteHtml
            ? `<tr><td style="padding:0 24px 20px;font-size:13px;color:#555;line-height:1.5">${opts.footerNoteHtml}</td></tr>`
            : ''
        }
        <tr>
          <td style="padding:16px 24px;background:#f6faf7;border-top:1px solid #d5e0d8;font-size:12px;color:#44554c;line-height:1.5;text-align:center">
            PEERPoint · Salt Lake County Sheriff’s Office Peer Support<br/>
            Emergencies: 911 · Crisis: 988 · Peer line: 801-548-8002
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function howtoUrls(role: 'admin' | 'staff'): { pdf: string; docx: string; label: string } {
  if (role === 'admin') {
    return {
      pdf: `${MEMBER_ORIGIN}/docs/PEERPoint-Admin-How-To.pdf`,
      docx: `${MEMBER_ORIGIN}/docs/PEERPoint-Admin-How-To.docx`,
      label: 'Admin How-To'
    };
  }
  return {
    pdf: `${MEMBER_ORIGIN}/docs/PEERPoint-Staff-How-To.pdf`,
    docx: `${MEMBER_ORIGIN}/docs/PEERPoint-Staff-How-To.docx`,
    label: 'Staff How-To'
  };
}

export async function sendInviteEmail(
  env: Env,
  opts: { to: string; inviteUrl: string; firstName: string; role: 'admin' | 'staff' }
): Promise<SendInviteResult> {
  const roleLabel = opts.role === 'admin' ? 'Admin' : 'Staff';
  const name = opts.firstName.trim() || 'there';
  const howto = howtoUrls(opts.role);
  const signInUrl =
    opts.role === 'admin' ? 'https://admin.mypeerpoint.com' : `${MEMBER_ORIGIN}/staff`;

  const subject = `Welcome to PEERPoint — verify your email (${roleLabel})`;
  const text = `Hi ${name},

You have been invited to join PEERPoint as ${roleLabel} (Peer Support Member).

1) Verify your email (required before registration):
${opts.inviteUrl}

After you verify, we will call your cell to complete SMS phone verification, then you can finish registration.

2) Download your ${howto.label} (PDF):
${howto.pdf}

Word version:
${howto.docx}

After you finish setup, sign in at:
${signInUrl}

This verify link expires in 7 days. If you did not expect this email, you can ignore it.

— PEERPoint
Salt Lake County Sheriff’s Office Peer Support
`;

  const html = brandedEmailShell({
    title: `Verify your email — ${roleLabel} invite`,
    greetingHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Hi ${escapeHtml(name)},</p>`,
    bodyHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">You have been invited to join <strong>PEERPoint</strong> as <strong>${roleLabel}</strong> (Peer Support Member).</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.5"><strong>Step 1:</strong> Verify this email address. After that, Twilio will call your cell so we can send you SMS alerts on a trial account. Then you finish registration (username and password).</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Keep your <strong>${escapeHtml(howto.label)}</strong> handy — it covers signing in, On Call, requests, notes, and time logging.</p>`,
    buttonsHtml: `${emailButton(opts.inviteUrl, 'Verify email', true)}
${emailButton(howto.pdf, `Download ${howto.label} (PDF)`, false)}
${emailButton(howto.docx, 'Download Word guide', false)}
${emailButton(signInUrl, opts.role === 'admin' ? 'Open Admin site' : 'Open Staff sign-in', false)}`,
    footerNoteHtml: `<p style="margin:0">This link expires in <strong>7 days</strong>. If you did not expect this email, you can ignore it.</p>`
  });

  const result = await sendResendEmail(env, { to: opts.to, subject, text, html });
  if (result.ok && !result.emailed) {
    return {
      ...result,
      reason: `${result.reason} Share the verify link manually.`
    };
  }
  return result;
}

/** Re-send / account email verification (existing member). */
export async function sendEmailVerificationEmail(
  env: Env,
  opts: { to: string; verifyUrl: string; firstName: string; role: 'admin' | 'staff' }
): Promise<SendEmailResult> {
  const roleLabel = opts.role === 'admin' ? 'Admin' : 'Staff';
  const name = opts.firstName.trim() || 'there';
  const subject = `PEERPoint — verify your ${roleLabel} email`;
  const text = `Hi ${name},

Please verify your PEERPoint ${roleLabel} email address:
${opts.verifyUrl}

After you verify, we will start cell phone verification for SMS alerts (Twilio will call you).

This link expires in 7 days.

— PEERPoint
`;
  const html = brandedEmailShell({
    title: 'Verify your email',
    greetingHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Hi ${escapeHtml(name)},</p>`,
    bodyHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Please verify your <strong>PEERPoint ${escapeHtml(roleLabel)}</strong> email. After you confirm, we start cell phone verification so SMS alerts can reach you.</p>`,
    buttonsHtml: emailButton(opts.verifyUrl, 'Verify email', true),
    footerNoteHtml: `<p style="margin:0">This link expires in <strong>7 days</strong>.</p>`
  });
  return sendResendEmail(env, { to: opts.to, subject, text, html });
}

/** Email the Twilio keypad code after email is verified (or Admin retriggers phone verify). */
export async function sendTwilioPhoneVerifyEmail(
  env: Env,
  opts: {
    to: string;
    firstName: string;
    phoneE164: string;
    validationCode: string;
    continueUrl: string;
    alreadyVerified?: boolean;
  }
): Promise<SendEmailResult> {
  const name = opts.firstName.trim() || 'there';
  if (opts.alreadyVerified) {
    const subject = 'PEERPoint — your cell is already verified for SMS';
    const text = `Hi ${name},

Your cell ${opts.phoneE164} is already verified for PEERPoint SMS alerts.

Continue here:
${opts.continueUrl}

— PEERPoint
`;
    const html = brandedEmailShell({
      title: 'Cell already verified',
      greetingHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Hi ${escapeHtml(name)},</p>`,
      bodyHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Your cell <strong>${escapeHtml(opts.phoneE164)}</strong> is already verified for PEERPoint SMS alerts.</p>`,
      buttonsHtml: emailButton(opts.continueUrl, 'Continue', true)
    });
    return sendResendEmail(env, { to: opts.to, subject, text, html });
  }

  const subject = `PEERPoint — enter code ${opts.validationCode} on the Twilio call`;
  const text = `Hi ${name},

Your email is verified. Twilio is calling ${opts.phoneE164} to verify your cell for SMS alerts.

1) Answer the call
2) Enter this code on your phone keypad: ${opts.validationCode}

Then continue here:
${opts.continueUrl}

— PEERPoint
`;
  const html = brandedEmailShell({
    title: 'Verify your cell for SMS',
    greetingHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Hi ${escapeHtml(name)},</p>`,
    bodyHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Your email is confirmed. <strong>Twilio is calling</strong> <strong>${escapeHtml(opts.phoneE164)}</strong> now.</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Answer and enter this code on your <strong>phone keypad</strong> (not by typing it into a web form):</p>
<p style="margin:0 0 16px;font-size:28px;letter-spacing:0.2em;font-weight:700;font-variant-numeric:tabular-nums;color:${BRAND_GREEN}">${escapeHtml(opts.validationCode)}</p>`,
    buttonsHtml: emailButton(opts.continueUrl, 'Continue in PEERPoint', true),
    footerNoteHtml: `<p style="margin:0">If you miss the call, ask an Admin to retrigger phone verification from the Members list, or use Account → Verify cell in the Staff app.</p>`
  });
  return sendResendEmail(env, { to: opts.to, subject, text, html });
}

/** Alert on-call staff that a member is waiting in the peer queue. */
export async function sendOnCallAlertEmail(
  env: Env,
  opts: {
    to: string;
    staffFirstName: string;
    contactMode: 'chat' | 'voice';
    staffUrl: string;
    preferredSexLabel: string;
  }
): Promise<SendEmailResult> {
  const name = opts.staffFirstName.trim() || 'there';
  const modeLabel = opts.contactMode === 'voice' ? 'voice call' : 'chat';
  const subject = `PEERPoint: member waiting for ${modeLabel} — Accept in Staff`;
  const text = `Hi ${name},

A member is waiting for peer support (${modeLabel}).
They preferred a ${opts.preferredSexLabel} peer.

Sign in to the Staff app and tap Accept to join. The app connects you — no room code to share.

${opts.staffUrl}

— PEERPoint
`;
  const html = brandedEmailShell({
    title: `Member waiting for ${modeLabel}`,
    greetingHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Hi ${escapeHtml(name)},</p>`,
    bodyHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">A member is waiting for peer support (<strong>${escapeHtml(modeLabel)}</strong>).</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.5">They preferred a <strong>${escapeHtml(opts.preferredSexLabel)}</strong> peer.</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Open the Staff app and tap <strong>Accept</strong>. PEERPoint connects you automatically — no room code to share.</p>`,
    buttonsHtml: emailButton(opts.staffUrl, 'Open Staff & accept', true),
    footerNoteHtml: `<p style="margin:0">If you cannot take this request, decline in the Staff app so another on-call peer can be tried.</p>`
  });

  return sendResendEmail(env, { to: opts.to, subject, text, html });
}

/** Half-hour reminder while a Peer Support Member remains marked unavailable. */
export async function sendUnavailableReminderEmail(
  env: Env,
  opts: {
    to: string;
    staffFirstName: string;
    unavailableSinceLabel: string;
    reason: string;
  }
): Promise<SendEmailResult> {
  const name = opts.staffFirstName.trim() || 'there';
  const staffUrl = `${MEMBER_ORIGIN}/staff`;
  const subject = 'PEERPoint reminder: you still show as Unavailable';
  const text = `Hi ${name},

You still show as Unavailable in PEERPoint (supporting a peer / ${opts.reason}).
Unavailable since: ${opts.unavailableSinceLabel}

While you are Unavailable, members will not be matched to you for immediate contact.

When you are free again, sign in and tap “Mark myself available”:
${staffUrl}

— PEERPoint
`;
  const html = brandedEmailShell({
    title: 'You still show as Unavailable',
    greetingHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Hi ${escapeHtml(name)},</p>`,
    bodyHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">You still show as <strong>Unavailable</strong> in PEERPoint (<em>${escapeHtml(opts.reason)}</em>).</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Unavailable since: <strong>${escapeHtml(opts.unavailableSinceLabel)}</strong></p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Members will not be matched to you for immediate contact until you mark yourself available again.</p>`,
    buttonsHtml: emailButton(staffUrl, 'Open Staff app & mark available', true),
    footerNoteHtml: `<p style="margin:0">You will get this reminder about every 30 minutes until you mark yourself available.</p>`
  });

  return sendResendEmail(env, { to: opts.to, subject, text, html });
}

/** Email member + staff with room code, token join links, and reconnect instructions. */
export async function sendRoomConnectEmails(
  env: Env,
  opts: {
    contactMode: 'chat' | 'voice';
    roomCode: string;
    /** Prefer token join URL; falls back to room query if omitted. */
    joinUrl?: string;
    memberEmail?: string;
    memberName?: string;
    staffEmail?: string;
    staffFirstName?: string;
  }
): Promise<{ memberEmailed: boolean; staffEmailed: boolean }> {
  const modeLabel = opts.contactMode === 'voice' ? 'Peer voice' : 'Peer chat';
  const path = opts.contactMode === 'voice' ? '/voice' : '/chat';
  const joinUrl =
    (opts.joinUrl || '').trim() ||
    `${MEMBER_ORIGIN}${path}?room=${encodeURIComponent(opts.roomCode)}`;
  const staffUrl = `${MEMBER_ORIGIN}/staff`;
  const room = opts.roomCode.toUpperCase();

  let memberEmailed = false;
  let staffEmailed = false;

  const memberTo = (opts.memberEmail || '').trim();
  if (memberTo && !memberTo.includes('not-provided@') && memberTo.includes('@')) {
    const name = (opts.memberName || 'there').trim() || 'there';
    const subject = `PEERPoint: your ${modeLabel} room code is ${room}`;
    const text = `Hi ${name},

Your peer support ${modeLabel.toLowerCase()} is ready.

Room code: ${room}

Open this secure link to connect (filled in for you):
${joinUrl}

If you get disconnected, open Peer ${opts.contactMode === 'voice' ? 'voice' : 'chat'} in PEERPoint and enter room code ${room} to reconnect.

This room code / link expires after 24 hours of no use.

— PEERPoint
`;
    const html = brandedEmailShell({
      title: `${modeLabel} is ready`,
      greetingHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Hi ${escapeHtml(name)},</p>`,
      bodyHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Your peer support session is ready.</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Room code: <strong style="font-size:22px;letter-spacing:0.06em">${escapeHtml(room)}</strong></p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Tap the button below to connect with a secure join link. If you get disconnected, open PEERPoint and enter this same room code to reconnect.</p>
<p style="margin:0 0 12px;font-size:14px;color:#555">Links and room codes expire after <strong>24 hours</strong> with no use.</p>`,
      buttonsHtml: `${emailButton(joinUrl, `Join ${modeLabel}`, true)}${emailButton(MEMBER_ORIGIN, 'Open PEERPoint', false)}`,
      footerNoteHtml: `<p style="margin:0">Keep this email handy in case you need to reconnect.</p>`
    });
    const r = await sendResendEmail(env, { to: memberTo, subject, text, html });
    memberEmailed = r.ok && r.emailed === true;
  }

  const staffTo = (opts.staffEmail || '').trim();
  if (staffTo && staffTo.includes('@')) {
    const name = (opts.staffFirstName || 'there').trim() || 'there';
    const subject = `PEERPoint: join ${modeLabel} — room ${room}`;
    const text = `Hi ${name},

A member is ready for ${modeLabel.toLowerCase()}.

Room code: ${room}

Join now (secure link):
${joinUrl}

Or open Staff, then Peer ${opts.contactMode === 'voice' ? 'voice' : 'chat'}, and enter room ${room}.

If you get disconnected, use the same room code to reconnect. Expires after 24 hours of no use.

Staff home: ${staffUrl}

— PEERPoint
`;
    const html = brandedEmailShell({
      title: `Join ${modeLabel}`,
      greetingHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Hi ${escapeHtml(name)},</p>`,
      bodyHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">A member is ready for <strong>${escapeHtml(modeLabel.toLowerCase())}</strong>.</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Room code: <strong style="font-size:22px;letter-spacing:0.06em">${escapeHtml(room)}</strong></p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Tap below to connect with a secure join link. If you get disconnected, enter the same room code to reconnect. Codes expire after <strong>24 hours</strong> of no use.</p>`,
      buttonsHtml: `${emailButton(joinUrl, `Join ${modeLabel}`, true)}${emailButton(staffUrl, 'Open Staff', false)}`,
      footerNoteHtml: `<p style="margin:0">When finished, mark yourself Available again in the Staff app if you were set Unavailable.</p>`
    });
    const r = await sendResendEmail(env, { to: staffTo, subject, text, html });
    staffEmailed = r.ok && r.emailed === true;
  }

  return { memberEmailed, staffEmailed };
}

/** Notify Peer Support Leaders when on-call cannot cover a request. */
export async function sendLeaderFallbackEmail(
  env: Env,
  opts: {
    to: string;
    leaderFirstName: string;
    reason: string;
    contactMode?: 'chat' | 'voice';
    memberHint?: string;
    staffUrl: string;
  }
): Promise<SendEmailResult> {
  const name = opts.leaderFirstName.trim() || 'there';
  const mode = opts.contactMode === 'voice' ? 'voice' : opts.contactMode === 'chat' ? 'chat' : 'peer support';
  const subject = `PEERPoint Leaders: on-call unavailable — ${mode} needs coverage`;
  const text = `Hi ${name},

PEERPoint needs a Peer Support Leader.

${opts.reason}

${opts.memberHint ? `Member context: ${opts.memberHint}\n` : ''}
Open Staff to review the queue and help or reassign:
${opts.staffUrl}

— PEERPoint
`;
  const html = brandedEmailShell({
    title: 'On-call coverage needed',
    greetingHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Hi ${escapeHtml(name)},</p>`,
    bodyHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">You are marked as a <strong>Peer Support Leader</strong>. On-call coverage needs attention:</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${escapeHtml(opts.reason)}</p>
${opts.memberHint ? `<p style="margin:0 0 12px;font-size:14px;color:#555">${escapeHtml(opts.memberHint)}</p>` : ''}`,
    buttonsHtml: emailButton(opts.staffUrl, 'Open Staff queue', true),
    footerNoteHtml: `<p style="margin:0">Leaders are notified when no free on-call peer is available or a peer declines a waiting member.</p>`
  });
  return sendResendEmail(env, { to: opts.to, subject, text, html });
}

export async function sendPasswordResetEmail(
  env: Env,
  opts: { to: string; resetUrl: string; firstName: string; role: 'admin' | 'staff' }
): Promise<SendEmailResult> {
  const roleLabel = opts.role === 'admin' ? 'Admin' : 'Staff';
  const name = opts.firstName.trim() || 'there';
  const signInUrl =
    opts.role === 'admin' ? 'https://admin.mypeerpoint.com' : `${MEMBER_ORIGIN}/staff`;

  const subject = `PEERPoint ${roleLabel} password reset`;
  const text = `Hi ${name},

We received a request to reset your PEERPoint ${roleLabel} password.

Reset your password (link expires in 1 hour):
${opts.resetUrl}

If you did not request this, you can ignore this email. Your password will stay the same.

After resetting, sign in at:
${signInUrl}

— PEERPoint
Salt Lake County Sheriff’s Office Peer Support
`;

  const html = brandedEmailShell({
    title: `Reset your ${roleLabel} password`,
    greetingHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Hi ${escapeHtml(name)},</p>`,
    bodyHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">We received a request to reset your <strong>PEERPoint ${escapeHtml(roleLabel)}</strong> password.</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Use the button below to choose a new password. This link expires in <strong>1 hour</strong>.</p>`,
    buttonsHtml: `${emailButton(opts.resetUrl, 'Reset password', true)}
${emailButton(signInUrl, opts.role === 'admin' ? 'Open Admin sign-in' : 'Open Staff sign-in', false)}`,
    footerNoteHtml: `<p style="margin:0">If you did not request a password reset, you can ignore this email. Your password will stay the same.</p>`
  });

  return sendResendEmail(env, { to: opts.to, subject, text, html });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
