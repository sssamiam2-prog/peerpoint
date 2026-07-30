import { sendLeaderFallbackEmail, sendOnCallAlertEmail, sendRoomConnectEmails } from '../_lib/email';
import { isStaffNotifyPaused } from '../_lib/notifyPause';
import { isTwilioSmsConfigured, sendTwilioSms } from '../_lib/sms';
import type { Env, HelpRequest } from '../_lib/store';
import { notifyTeams } from '../_lib/store';
import {
  displayNameFor,
  loadPeerSupportLeaders,
  loadUsers,
  MEMBER_ORIGIN,
  type StaffUser
} from '../_lib/staffAuth';

function staffEmail(u: StaffUser): string {
  return (u.workEmail || u.email || u.personalEmail || '').trim();
}

function staffPhone(u: StaffUser): string {
  return (u.cellPhone || u.workPhone || u.homePhone || '').trim();
}

/** Staff SMS when a peer-support room is ready (join link + room code). */
export function staffRoomReadySms(joinUrl: string, roomCode: string): string {
  const room = roomCode.trim().toUpperCase();
  return (
    `From SLCO Sheriff's Office - You have a Peer Support request pending - ` +
    `Please click here to go directly to the Chat ${joinUrl} The room code is ${room}`
  );
}

/** Requester SMS when their request created a room (join link + room code). */
export function memberRoomReadySms(joinUrl: string, roomCode: string): string {
  const room = roomCode.trim().toUpperCase();
  return (
    `From SLCO Sheriff's Office - Your request has been sent to the Peer Support Staff Member ` +
    `and they should join the chat shortly. Your Room code is ${room} ` +
    `Please click this link to be taken to the private anonymous chat. ${joinUrl}`
  );
}

export type RoomNotifyResult = {
  memberEmailed: boolean;
  staffEmailed: boolean;
  memberSms: boolean;
  staffSms: boolean;
  /** Human-readable delivery summary for Staff UI. */
  summary: string;
  smsConfigured: boolean;
  memberSmsNote?: string;
  staffSmsNote?: string;
};

function buildNotifySummary(r: Omit<RoomNotifyResult, 'summary'>): string {
  const parts: string[] = [];
  parts.push(r.memberEmailed ? 'Member emailed' : 'Member email not sent');
  parts.push(r.staffEmailed ? 'Staff emailed' : 'Staff email not sent');
  if (!r.smsConfigured) {
    parts.push('SMS not configured (Twilio secrets)');
  } else {
    parts.push(r.memberSms ? 'Member texted' : `Member SMS skipped${r.memberSmsNote ? ` (${r.memberSmsNote})` : ''}`);
    parts.push(r.staffSms ? 'Staff texted' : `Staff SMS skipped${r.staffSmsNote ? ` (${r.staffSmsNote})` : ''}`);
  }
  return parts.join(' · ');
}

export type OnCallQueueAlertResult = {
  emailed: boolean;
  sms: boolean;
  smsConfigured: boolean;
  smsNote?: string;
  summary: string;
};

/** Alert the offered on-call peer that a member is waiting (email + SMS). No room code yet. */
export async function notifyOnCallPeerWaiting(
  env: Env,
  opts: {
    staff: StaffUser;
    contactMode: 'chat' | 'voice';
    preferredSexLabel: string;
  }
): Promise<OnCallQueueAlertResult> {
  const staffUrl = `${MEMBER_ORIGIN}/staff`;
  const modeLabel = opts.contactMode === 'voice' ? 'voice call' : 'chat';
  const smsConfigured = isTwilioSmsConfigured(env);
  const paused = isStaffNotifyPaused(env);
  let emailed = false;
  let sms = false;
  let smsNote: string | undefined;

  if (paused) {
    return {
      emailed: false,
      sms: false,
      smsConfigured,
      smsNote: 'Staff notifications paused',
      summary: 'Staff email/SMS paused (PEERPOINT_PAUSE_STAFF_NOTIFY)'
    };
  }

  const toEmail = staffEmail(opts.staff);
  if (toEmail) {
    const mail = await sendOnCallAlertEmail(env, {
      to: toEmail,
      staffFirstName: opts.staff.firstName || displayNameFor(opts.staff),
      contactMode: opts.contactMode,
      staffUrl,
      preferredSexLabel: opts.preferredSexLabel
    });
    emailed = mail.ok && mail.emailed === true;
  }

  const phone = staffPhone(opts.staff);
  if (!phone) {
    smsNote = 'No cell/work phone on staff profile';
  } else if (!smsConfigured) {
    smsNote = 'Twilio not configured';
  } else {
    const result = await sendTwilioSms(env, {
      to: phone,
      body:
        `From SLCO Sheriff's Office - You have a Peer Support ${modeLabel} request pending. ` +
        `Open Staff to Accept: ${staffUrl}`
    });
    if (result.ok && result.sent === true) {
      sms = true;
    } else if (result.ok) {
      smsNote = result.reason;
    } else {
      smsNote = result.error;
    }
  }

  const parts: string[] = [];
  parts.push(emailed ? 'Staff emailed' : 'Staff email not sent');
  if (!smsConfigured) parts.push('SMS not configured');
  else parts.push(sms ? 'Staff texted' : `Staff SMS skipped${smsNote ? ` (${smsNote})` : ''}`);

  return {
    emailed,
    sms,
    smsConfigured,
    smsNote,
    summary: parts.join(' · ')
  };
}

/** After a room is issued, email + optionally SMS member and assigned staff with token join links. */
export async function emailRoomParticipants(
  env: Env,
  item: HelpRequest
): Promise<RoomNotifyResult> {
  const mode = item.contactMode === 'voice' ? 'voice' : 'chat';
  const room = item.roomCode;
  const token = item.memberJoinToken;
  const smsConfigured = isTwilioSmsConfigured(env);
  if (!room || !token) {
    const empty: RoomNotifyResult = {
      memberEmailed: false,
      staffEmailed: false,
      memberSms: false,
      staffSms: false,
      smsConfigured,
      summary: 'No room/token — nothing to notify.',
      memberSmsNote: 'No room',
      staffSmsNote: 'No room'
    };
    return empty;
  }

  let staff: StaffUser | undefined;
  if (item.assignedPeerUsername) {
    const users = await loadUsers(env);
    staff = users.find(u => u.username === item.assignedPeerUsername);
  }

  const joinPath = `/join?t=${encodeURIComponent(token)}`;
  const joinUrl = `${MEMBER_ORIGIN}${joinPath}`;

  const mailed = await sendRoomConnectEmails(env, {
    contactMode: mode,
    roomCode: room,
    joinUrl,
    memberEmail: item.requesterEmail,
    memberName: item.memberDisplayName || item.requesterName,
    staffEmail: staff ? staffEmail(staff) : undefined,
    staffFirstName: staff?.firstName || item.assignedPeer
  });

  let memberSms = false;
  let staffSms = false;
  let memberSmsNote: string | undefined;
  let staffSmsNote: string | undefined;

  const memberPhone = (item.requesterPhone || '').trim();
  if (!memberPhone || memberPhone.toLowerCase() === 'test' || memberPhone.toLowerCase() === 'not provided') {
    memberSmsNote = 'No member phone on request';
  } else if (!smsConfigured) {
    memberSmsNote = 'Twilio not configured';
  } else {
    const sms = await sendTwilioSms(env, {
      to: memberPhone,
      body: memberRoomReadySms(joinUrl, room)
    });
    if (sms.ok && sms.sent === true) {
      memberSms = true;
    } else if (sms.ok) {
      memberSmsNote = sms.reason;
    } else {
      memberSmsNote = sms.error;
    }
  }

  if (!staff) {
    staffSmsNote = 'No assigned staff profile';
  } else if (isStaffNotifyPaused(env)) {
    staffSmsNote = 'Staff notifications paused';
  } else {
    const phone = staffPhone(staff);
    if (!phone) {
      staffSmsNote = 'No cell/work phone on staff profile';
    } else if (!smsConfigured) {
      staffSmsNote = 'Twilio not configured';
    } else {
      const sms = await sendTwilioSms(env, {
        to: phone,
        body: staffRoomReadySms(joinUrl, room)
      });
      if (sms.ok && sms.sent === true) {
        staffSms = true;
      } else if (sms.ok) {
        staffSmsNote = sms.reason;
      } else {
        staffSmsNote = sms.error;
      }
    }
  }

  const result: Omit<RoomNotifyResult, 'summary'> = {
    memberEmailed: mailed.memberEmailed,
    staffEmailed: isStaffNotifyPaused(env) ? false : mailed.staffEmailed,
    memberSms,
    staffSms,
    smsConfigured,
    memberSmsNote,
    staffSmsNote
  };
  return { ...result, summary: buildNotifySummary(result) };
}

/** Alert all Peer Support Leaders (and note when none are configured). */
export async function notifyLeadersOfCoverageGap(
  env: Env,
  opts: {
    reason: string;
    contactMode?: 'chat' | 'voice';
    memberHint?: string;
  }
): Promise<{ leadersNotified: number; leaderCount: number }> {
  const leaders = await loadPeerSupportLeaders(env);
  let leadersNotified = 0;
  const staffUrl = `${MEMBER_ORIGIN}/staff`;

  if (isStaffNotifyPaused(env)) {
    await notifyTeams(
      env,
      `PEERPoint Leader alert (email paused)\n${opts.reason}\nLeaders configured: ${leaders.length}\nEmailed: 0`
    );
    return { leadersNotified: 0, leaderCount: leaders.length };
  }

  for (const leader of leaders) {
    const to = staffEmail(leader);
    if (!to) continue;
    const mail = await sendLeaderFallbackEmail(env, {
      to,
      leaderFirstName: leader.firstName || displayNameFor(leader),
      reason: opts.reason,
      contactMode: opts.contactMode,
      memberHint: opts.memberHint,
      staffUrl
    });
    if (mail.ok && mail.emailed) leadersNotified += 1;
  }

  await notifyTeams(
    env,
    `PEERPoint Leader alert\n${opts.reason}\nLeaders configured: ${leaders.length}\nEmailed: ${leadersNotified}`
  );

  return { leadersNotified, leaderCount: leaders.length };
}
