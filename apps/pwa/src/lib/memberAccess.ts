/**
 * Member-side site use gate (client).
 * Valid codes live only on the server — this module never embeds them.
 * Unlock is session-only and does not identify the employee.
 */

const UNLOCK_KEY = 'peerpoint_member_unlocked';
const CODE_KEY = 'peerpoint_site_use_code';

export function isMemberAccessUnlocked(): boolean {
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === '1' && Boolean(sessionStorage.getItem(CODE_KEY));
  } catch {
    return false;
  }
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
    sessionStorage.setItem(UNLOCK_KEY, '1');
    sessionStorage.setItem(CODE_KEY, siteUseCode.trim());
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
