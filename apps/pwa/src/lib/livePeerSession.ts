/** Persist peer session so members/staff can reconnect after a drop. */

const KEY = 'peerpoint_live_session';

export type LivePeerSession = {
  requestId?: string;
  memberJoinToken?: string;
  room: string;
  name: string;
  mode: 'chat' | 'voice';
  role: 'member' | 'staff';
  savedAt: string;
};

export function saveLivePeerSession(session: Omit<LivePeerSession, 'savedAt'>): void {
  try {
    const payload: LivePeerSession = { ...session, savedAt: new Date().toISOString() };
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function loadLivePeerSession(mode?: 'chat' | 'voice'): LivePeerSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LivePeerSession;
    if (!parsed.room || !parsed.name) return null;
    if (mode && parsed.mode !== mode) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearLivePeerSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
