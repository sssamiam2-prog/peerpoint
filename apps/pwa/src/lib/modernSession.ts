import { getStoredSiteUseCode } from './memberAccess';

const KEY = 'peerpoint_modern_session';

export type ModernSession = {
  requestId: string;
  anonymousSessionToken: string;
  publicSupportCode: string;
  savedAt: number;
};

export function saveModernSession(session: Omit<ModernSession, 'savedAt'>): ModernSession {
  const saved = { ...session, savedAt: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* private browsing / quota */
  }
  return saved;
}

export function loadModernSession(): ModernSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ModernSession>;
    if (
      typeof parsed.requestId !== 'string' ||
      typeof parsed.anonymousSessionToken !== 'string' ||
      typeof parsed.publicSupportCode !== 'string'
    ) {
      return null;
    }
    return { ...parsed, savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now() } as ModernSession;
  } catch {
    return null;
  }
}

export function clearModernSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export { getStoredSiteUseCode };
