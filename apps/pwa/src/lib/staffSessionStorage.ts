export type StaffSessionMeta = {
  role: 'admin' | 'staff';
  username?: string;
  displayName?: string;
  peerAvailable?: boolean;
  unavailableSince?: string;
  unavailableReason?: string;
  mustChangePassword?: boolean;
};

const TOKEN_KEY = 'peerpoint_staff_token';
const META_KEY = 'peerpoint_staff_meta';
const REMEMBER_KEY = 'peerpoint_staff_remember';
const LAST_USERNAME_KEY = 'peerpoint_staff_last_username';
const PASSKEY_HINT_PREFIX = 'peerpoint_passkey_enabled:';

function storageForRemember(remember: boolean): Storage {
  return remember ? localStorage : sessionStorage;
}

/** Prefer localStorage (stay signed in), then sessionStorage. */
export function readStaffToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function readStaffMeta(): StaffSessionMeta | null {
  try {
    const raw = localStorage.getItem(META_KEY) || sessionStorage.getItem(META_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StaffSessionMeta;
  } catch {
    return null;
  }
}

export function readRememberPreference(): boolean {
  try {
    const v = localStorage.getItem(REMEMBER_KEY);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch {
    /* ignore */
  }
  return defaultRememberMe();
}

export function defaultRememberMe(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    const nav = navigator as Navigator & { standalone?: boolean };
    if (nav.standalone) return true;
  } catch {
    /* ignore */
  }
  return true;
}

export function readLastUsername(): string {
  try {
    return (localStorage.getItem(LAST_USERNAME_KEY) ?? '').trim();
  } catch {
    return '';
  }
}

export function writeStaffSession(token: string, meta: StaffSessionMeta, remember: boolean): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(META_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(META_KEY);
    const store = storageForRemember(remember);
    store.setItem(TOKEN_KEY, token);
    store.setItem(META_KEY, JSON.stringify(meta));
    localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
    if (meta.username) localStorage.setItem(LAST_USERNAME_KEY, meta.username);
  } catch {
    /* ignore quota / private mode */
  }
}

export function patchStaffMeta(meta: StaffSessionMeta): void {
  try {
    const remember = readRememberPreference();
    const store = storageForRemember(remember);
    store.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

export function clearStaffSession(clearLastUsername = false): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(META_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(META_KEY);
    localStorage.removeItem(REMEMBER_KEY);
    if (clearLastUsername) localStorage.removeItem(LAST_USERNAME_KEY);
  } catch {
    /* ignore */
  }
}

export function passkeyHintForUsername(username: string): boolean {
  const u = username.trim().toLowerCase();
  if (!u) return false;
  try {
    return localStorage.getItem(`${PASSKEY_HINT_PREFIX}${u}`) === '1';
  } catch {
    return false;
  }
}

export function setPasskeyHint(username: string, enabled: boolean): void {
  const u = username.trim().toLowerCase();
  if (!u) return;
  try {
    const key = `${PASSKEY_HINT_PREFIX}${u}`;
    if (enabled) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function webAuthnSupported(): boolean {
  try {
    return typeof window !== 'undefined' && window.isSecureContext && typeof PublicKeyCredential !== 'undefined';
  } catch {
    return false;
  }
}
