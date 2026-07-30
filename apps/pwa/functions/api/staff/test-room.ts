import { sendRoomConnectEmails } from '../../_lib/email';
import { memberRoomReadySms, staffRoomReadySms } from '../../_lib/roomNotify';
import { isTwilioSmsConfigured, sendTwilioSms } from '../../_lib/sms';
import {
  corsHeaders,
  json,
  loadRequests,
  newId,
  randomRoomCode,
  saveRequests,
  type Env,
  type HelpRequest
} from '../../_lib/store';
import { MEMBER_ORIGIN, requireAdmin } from '../../_lib/staffAuth';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/**
 * POST /api/staff/test-room
 * Admin-only: mint an assigned room for smoke-testing Peer chat / voice.
 * Optional notify: email + SMS join links to custom member/staff contacts.
 */
export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const auth = await requireAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, auth.status, origin);
  if (!env.PEERPOINT_KV) {
    return json({ error: 'PEERPOINT_KV is required.' }, 503, origin);
  }

  let body: {
    contactMode?: string;
    notify?: boolean;
    memberEmail?: string;
    memberPhone?: string;
    memberName?: string;
    staffEmail?: string;
    staffPhone?: string;
    staffFirstName?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    /* empty body ok */
  }

  const contactMode: 'chat' | 'voice' = body.contactMode === 'voice' ? 'voice' : 'chat';
  const nowIso = new Date().toISOString();
  const roomCode = randomRoomCode();
  const memberJoinToken = newId();
  const memberName = String(body.memberName ?? 'Admin test').trim() || 'Admin test';
  const memberEmail = String(body.memberEmail ?? 'admin-test@peerpoint.local').trim();
  const memberPhone = String(body.memberPhone ?? 'test').trim();

  const record: HelpRequest = {
    id: newId(),
    submittedAt: nowIso,
    requesterName: memberName,
    memberDisplayName: memberName,
    requesterPhone: memberPhone,
    requesterEmail: memberEmail,
    preferredContact: contactMode,
    description: `Admin test room (${contactMode}) — safe to close`,
    consentAcknowledged: true,
    status: 'assigned',
    assignedPeer: auth.session.displayName || auth.session.username || 'Admin',
    assignedPeerUsername: auth.session.username,
    contactMode,
    roomCode,
    roomIssuedAt: nowIso,
    roomLastUsedAt: nowIso,
    memberJoinToken,
    acceptedAt: nowIso
  };

  const list = await loadRequests(env);
  list.unshift(record);
  await saveRequests(env, list.slice(0, 500));

  const joinUrl = `${MEMBER_ORIGIN}/join?t=${encodeURIComponent(memberJoinToken)}`;
  let notify:
    | {
        memberEmailed: boolean;
        staffEmailed: boolean;
        memberSms: boolean;
        staffSms: boolean;
        memberSmsNote?: string;
        staffSmsNote?: string;
        summary: string;
      }
    | undefined;

  if (body.notify === true) {
    const staffEmail = String(body.staffEmail ?? '').trim();
    const staffPhone = String(body.staffPhone ?? '').trim();
    const staffFirstName = String(body.staffFirstName ?? 'Staff').trim() || 'Staff';
    const smsConfigured = isTwilioSmsConfigured(env);

    const mailed = await sendRoomConnectEmails(env, {
      contactMode,
      roomCode,
      joinUrl,
      memberEmail,
      memberName,
      staffEmail: staffEmail || undefined,
      staffFirstName
    });

    let memberSms = false;
    let staffSms = false;
    let memberSmsNote: string | undefined;
    let staffSmsNote: string | undefined;

    if (!memberPhone || memberPhone.toLowerCase() === 'test') {
      memberSmsNote = 'No member phone';
    } else if (!smsConfigured) {
      memberSmsNote = 'Twilio not configured';
    } else {
      const sms = await sendTwilioSms(env, {
        to: memberPhone,
        body: memberRoomReadySms(joinUrl, roomCode)
      });
      if (sms.ok && sms.sent === true) memberSms = true;
      else if (sms.ok) memberSmsNote = sms.reason;
      else memberSmsNote = sms.error;
    }

    if (!staffPhone) {
      staffSmsNote = 'No staff phone';
    } else if (!smsConfigured) {
      staffSmsNote = 'Twilio not configured';
    } else {
      const sms = await sendTwilioSms(env, {
        to: staffPhone,
        body: staffRoomReadySms(joinUrl, roomCode)
      });
      if (sms.ok && sms.sent === true) staffSms = true;
      else if (sms.ok) staffSmsNote = sms.reason;
      else staffSmsNote = sms.error;
    }

    const parts = [
      mailed.memberEmailed ? 'Member emailed' : 'Member email not sent',
      mailed.staffEmailed ? 'Staff emailed' : 'Staff email not sent',
      memberSms ? 'Member texted' : `Member SMS skipped${memberSmsNote ? ` (${memberSmsNote})` : ''}`,
      staffSms ? 'Staff texted' : `Staff SMS skipped${staffSmsNote ? ` (${staffSmsNote})` : ''}`
    ];
    notify = {
      memberEmailed: mailed.memberEmailed,
      staffEmailed: mailed.staffEmailed,
      memberSms,
      staffSms,
      memberSmsNote,
      staffSmsNote,
      summary: parts.join(' · ')
    };
  }

  return json(
    {
      ok: true,
      roomCode,
      contactMode,
      requestId: record.id,
      memberJoinToken,
      joinUrl,
      chatPath: `/chat?room=${encodeURIComponent(roomCode)}&from=join`,
      voicePath: `/voice?room=${encodeURIComponent(roomCode)}&from=join`,
      notify,
      message: notify
        ? `Test room created and notifications sent. ${notify.summary}`
        : 'Test room created. Open Chat and Voice with this code (two browsers or devices) to verify both sides connect.'
    },
    201,
    origin
  );
}
