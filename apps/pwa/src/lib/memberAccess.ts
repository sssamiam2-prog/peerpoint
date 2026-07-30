/**
 * Member-side site use gate (client).
 * Valid codes live only on the server — this module never embeds them.
 * Unlock is in-memory for the current page only. Installed PWAs must re-enter
 * the site use code on every fresh launch (sessionStorage alone can persist
 * across PWA closes on phones).
 *
 * Exception: email/SMS join links grant a short session bypass so members go
 * straight into chat/voice without re-entering the workplace site use code.
 */

const UNLOCK_KEY = 'peerpoint_member_unlocked';
const CODE_KEY = 'peerpoint_site_use_code';
const JOIN_BYPASS_KEY = 'peerpoint_join_bypass';

function safeRemove(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Drop any persisted unlock markers (session + legacy localStorage). */
export function clearMemberAccessUnlock(): void {
  safeRemove(sessionStorage, UNLOCK_KEY);
  safeRemove(sessionStorage, CODE_KEY);
  try {
    safeRemove(localStorage, UNLOCK_KEY);
    safeRemove(localStorage, CODE_KEY);
  } catch {
    /* private mode / blocked */
  }
}

/**
 * Always false for a new document load — the gate must be completed again.
 * (Do not restore unlock from storage; that skipped the modal on installed PWAs.)
 */
export function isMemberAccessUnlocked(): boolean {
  return false;
}

/** True when this tab opened a valid email/SMS join link. */
export function hasJoinLinkBypass(): boolean {
  try {
    return sessionStorage.getItem(JOIN_BYPASS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Call after /api/join resolves so /chat and /voice skip the site-use code modal. */
export function grantJoinLinkBypass(room?: string): void {
  try {
    sessionStorage.setItem(JOIN_BYPASS_KEY, '1');
    if (room?.trim()) {
      sessionStorage.setItem('peerpoint_join_room', room.trim().toUpperCase());
    }
  } catch {
    /* ignore */
  }
}

export function clearJoinLinkBypass(): void {
  safeRemove(sessionStorage, JOIN_BYPASS_KEY);
  safeRemove(sessionStorage, 'peerpoint_join_room');
}

/** Code the user typed after server validation — used on later API posts. */
export function getStoredSiteUseCode(): string | undefined {
  try {
    const code = sessionStorage.getItem(CODE_KEY);
    return code?.trim() ? code.trim() : undefined;
  } catch {
    return undefined;
  }
}

export function unlockMemberAccess(siteUseCode: string): void {
  try {
    // Only the verified code is kept for API calls this page session.
    // Do not set a durable "unlocked" flag — phones/PWA installs must re-enter.
    sessionStorage.removeItem(UNLOCK_KEY);
    sessionStorage.setItem(CODE_KEY, siteUseCode.trim());
    safeRemove(localStorage, UNLOCK_KEY);
    safeRemove(localStorage, CODE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

export async function verifySiteUseCode(
  siteUseCode: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/member-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteUseCode })
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: data.error ?? 'That site use code is not correct. Ask a Peer Support contact at the Sheriff’s Office.'
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not verify the site use code. Check your connection and try again.' };
  }
}
