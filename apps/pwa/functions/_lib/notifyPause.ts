import type { Env } from './store';

/**
 * When paused, PEERPoint must not email or text Peer Support staff
 * (invites, on-call alerts, leader fallback, room-ready staff notices).
 *
 * Default: PAUSED (safe for testing).
 * Re-enable staff notifications by setting Pages secret:
 *   PEERPOINT_PAUSE_STAFF_NOTIFY=0
 */
export function isStaffNotifyPaused(env: Env): boolean {
  const raw = env.PEERPOINT_PAUSE_STAFF_NOTIFY;
  if (raw === undefined || raw === null || String(raw).trim() === '') return true;
  const v = String(raw).trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off' && v !== 'no';
}
