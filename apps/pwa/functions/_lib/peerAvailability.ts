/**
 * Peer Support Member availability for immediate-contact matching.
 * Unavailable peers are skipped until they mark themselves available in the app.
 */

import { sendUnavailableReminderEmail } from './email';
import type { Env } from './store';
import {
  displayNameFor,
  loadUsers,
  saveUsers,
  type StaffUser
} from './staffAuth';

export const UNAVAILABLE_REMINDER_MS = 30 * 60 * 1000;

export function isPeerAvailable(user: StaffUser): boolean {
  return user.peerAvailable !== false;
}

export async function markPeerUnavailable(
  env: Env,
  username: string,
  reason: string
): Promise<StaffUser | null> {
  const users = await loadUsers(env);
  const idx = users.findIndex(u => u.username === username.toLowerCase() || u.username === username);
  if (idx < 0) return null;
  const now = new Date().toISOString();
  const u = { ...users[idx]! };
  // Already unavailable — keep original since, refresh reason.
  if (u.peerAvailable === false) {
    u.unavailableReason = reason;
    users[idx] = u;
    await saveUsers(env, users);
    return u;
  }
  u.peerAvailable = false;
  u.unavailableSince = now;
  u.unavailableReason = reason;
  u.lastUnavailableReminderAt = now; // first notice is the assignment alert; wait 30m for next
  users[idx] = u;
  await saveUsers(env, users);
  return u;
}

export async function markPeerAvailable(env: Env, username: string): Promise<StaffUser | null> {
  const users = await loadUsers(env);
  const idx = users.findIndex(u => u.username === username.toLowerCase() || u.username === username);
  if (idx < 0) return null;
  const u = { ...users[idx]! };
  u.peerAvailable = true;
  u.unavailableSince = undefined;
  u.unavailableReason = undefined;
  u.lastUnavailableReminderAt = undefined;
  users[idx] = u;
  await saveUsers(env, users);
  return u;
}

export type ReminderSweepResult = {
  checked: number;
  reminded: number;
  errors: number;
};

/** Email anyone still marked unavailable at least every 30 minutes. */
export async function sweepUnavailableReminders(env: Env): Promise<ReminderSweepResult> {
  const users = await loadUsers(env);
  const now = Date.now();
  let reminded = 0;
  let errors = 0;
  let changed = false;

  for (let i = 0; i < users.length; i++) {
    const u = users[i]!;
    if (u.peerAvailable !== false || !u.active) continue;

    const last = u.lastUnavailableReminderAt
      ? new Date(u.lastUnavailableReminderAt).getTime()
      : u.unavailableSince
        ? new Date(u.unavailableSince).getTime()
        : 0;
    if (last && now - last < UNAVAILABLE_REMINDER_MS) continue;

    const email = u.workEmail || u.email || u.personalEmail || '';
    if (!email) continue;

    const sinceLabel = u.unavailableSince
      ? new Date(u.unavailableSince).toLocaleString()
      : 'earlier';
    const mail = await sendUnavailableReminderEmail(env, {
      to: email,
      staffFirstName: u.firstName || displayNameFor(u),
      unavailableSinceLabel: sinceLabel,
      reason: u.unavailableReason || 'supporting a peer'
    });
    if (mail.ok && mail.emailed) {
      reminded += 1;
      users[i] = {
        ...u,
        lastUnavailableReminderAt: new Date(now).toISOString()
      };
      changed = true;
    } else {
      errors += 1;
    }
  }

  if (changed) await saveUsers(env, users);
  return { checked: users.filter(u => u.peerAvailable === false).length, reminded, errors };
}

export function availabilityPublicFields(user: StaffUser | undefined): {
  peerAvailable: boolean;
  unavailableSince?: string;
  unavailableReason?: string;
} {
  if (!user) return { peerAvailable: true };
  return {
    peerAvailable: isPeerAvailable(user),
    unavailableSince: user.unavailableSince,
    unavailableReason: user.unavailableReason
  };
}
