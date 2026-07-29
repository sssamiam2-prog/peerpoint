import { sendLeaderFallbackEmail, sendRoomConnectEmails } from '../_lib/email';
import { sendTwilioSms } from '../_lib/sms';
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

export type RoomNotifyResult = {
  memberEmailed: boolean;
  staffEmailed: boolean;
  memberSms: boolean;
  staffSms: boolean;
};

/** After a room is issued, email + optionally SMS member and assigned staff with token join links. */
export async function emailRoomParticipants(
  env: Env,
  item: HelpRequest
): Promise<RoomNotifyResult> {
  const mode = item.contactMode === 'voice' ? 'voice' : 'chat';
  const room = item.roomCode;
  const token = item.memberJoinToken;
  if (!room || !token) {
    return { memberEmailed: false, staffEmailed: false, memberSms: false, staffSms: false };
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

  const modeLabel = mode === 'voice' ? 'Peer voice' : 'Peer chat';
  let memberSms = false;
  let staffSms = false;

  const memberPhone = (item.requesterPhone || '').trim();
  if (memberPhone && memberPhone.toLowerCase() !== 'test' && memberPhone.toLowerCase() !== 'not provided') {
    const sms = await sendTwilioSms(env, {
      to: memberPhone,
      body: `PEERPoint: your ${modeLabel} is ready. Tap to join (keeps working if you disconnect — room ${room.toUpperCase()}): ${joinUrl}`
    });
    memberSms = sms.ok && sms.sent === true;
  }

  if (staff) {
    const phone = staffPhone(staff);
    if (phone) {
      const sms = await sendTwilioSms(env, {
        to: phone,
        body: `PEERPoint: member ready for ${modeLabel}. Join: ${joinUrl} (room ${room.toUpperCase()})`
      });
      staffSms = sms.ok && sms.sent === true;
    }
  }

  return {
    memberEmailed: mailed.memberEmailed,
    staffEmailed: mailed.staffEmailed,
    memberSms,
    staffSms
  };
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
