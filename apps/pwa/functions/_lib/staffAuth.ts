/**
 * Named Admin/Staff accounts + invite tokens, KV-backed sessions.
 */

import type { Env } from './store';

const USERS_KEY = 'peerpoint:staff_users';
const INVITES_INDEX_KEY = 'peerpoint:invites_index';
const INVITE_PREFIX = 'peerpoint:invite:';
const SESSION_PREFIX = 'peerpoint:session:';
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;
const PBKDF2_ITERATIONS = 100_000;
const MIN_PASSWORD_LENGTH = 8;

export const SEED_ADMIN_USERNAME = 'admin';
export const SEED_ADMIN_PASSWORD = 'PeersStandWithYou2026!';

export type StaffRole = 'admin' | 'staff';

/** Used for member preference matching on immediate contact. */
export type StaffSex = 'male' | 'female';

export type StaffUser = {
  username: string;
  role: StaffRole;
  firstName: string;
  lastName: string;
  bureau: string;
  jobTitle: string;
  email: string;
  /** Peer sex for matching member Male/Female preferences. */
  sex?: StaffSex;
  personalEmail?: string;
  workEmail?: string;
  currentShift?: string;
  cellPhone?: string;
  homePhone?: string;
  workPhone?: string;
  /** @deprecated legacy field — prefer firstName + lastName */
  displayName?: string;
  passwordHash: string;
  salt: string;
  active: boolean;
  setupComplete: boolean;
  createdAt: string;
  invitedBy?: string;
  /** Peer Support Leader — notified when on-call cannot take a request. */
  isPeerSupportLeader?: boolean;
  /**
   * Immediate-contact availability. Default true when unset.
   * Set false when assigned / supporting a peer; staff must mark true again in the app.
   */
  peerAvailable?: boolean;
  unavailableSince?: string;
  unavailableReason?: string;
  /** Last half-hour reminder email while unavailable. */
  lastUnavailableReminderAt?: string;
};

/** Master control account — not used for On Call matching or peer support work. */
export function isSeedAdminUsername(username: string | undefined | null): boolean {
  return String(username ?? '')
    .trim()
    .toLowerCase() === SEED_ADMIN_USERNAME;
}

/** Active Peer Support Members who can take On Call / immediate contact (excludes seed Admin). */
export function isOperationalPeer(user: StaffUser): boolean {
  return Boolean(user.active && user.setupComplete && !isSeedAdminUsername(user.username));
}

export type InviteRecord = {
  email: string;
  role: StaffRole;
  firstName: string;
  lastName: string;
  bureau: string;
  jobTitle: string;
  invitedBy: string;
  createdAt: string;
};

export type InviteIndexEntry = InviteRecord & { token: string };

export type StaffSession = {
  role: StaffRole;
  username: string;
  displayName?: string;
  exp: number;
};

export type PublicStaffAccount = {
  username: string;
  role: StaffRole;
  firstName: string;
  lastName: string;
  bureau: string;
  jobTitle: string;
  email: string;
  sex?: StaffSex;
  displayName?: string;
  active: boolean;
  setupComplete: boolean;
  createdAt: string;
  isPeerSupportLeader?: boolean;
};

export type PublicPendingInvite = {
  token: string;
  email: string;
  role: StaffRole;
  firstName: string;
  lastName: string;
  bureau: string;
  jobTitle: string;
  createdAt: string;
  invitedBy: string;
};

let memoryUsers: StaffUser[] = [];
const memorySessions = new Map<string, StaffSession>();
const memoryInvites = new Map<string, InviteRecord>();
let memoryInviteIndex: InviteIndexEntry[] = [];

/** Canonical Admin host (production). */
export const ADMIN_HOST = 'admin.mypeerpoint.com';
export const MEMBER_ORIGIN = 'https://mypeerpoint.com';
export const ADMIN_ORIGIN = `https://${ADMIN_HOST}`;

export function requestHostname(request: Request): string {
  const host = (request.headers.get('Host') ?? '').split(':')[0]!.trim().toLowerCase();
  return host;
}

export function isAdminHost(request: Request): boolean {
  const host = requestHostname(request);
  if (host === ADMIN_HOST) return true;
  if (host === 'admin.localhost') return true;
  if (host === 'localhost' || host === '127.0.0.1') return true;
  return false;
}

export function isProductionAdminHost(request: Request): boolean {
  return requestHostname(request) === ADMIN_HOST;
}

export function adminHostRequiredError(): { error: string; status: number } {
  return {
    error: `Admin access is only available at https://${ADMIN_HOST}. Open that URL to sign in as Admin.`,
    status: 403
  };
}

export function requireKv(env: Env): asserts env is Env & { PEERPOINT_KV: KVNamespace } {
  if (!env.PEERPOINT_KV) {
    throw new Error(
      'PEERPOINT_KV is required for staff accounts. Bind a KV namespace named PEERPOINT_KV on the Pages project.'
    );
  }
}

function bytesToBase64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]!);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '');
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateEmail(email: string): string | null {
  if (!email) return 'Email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.';
  return null;
}

export function validateUsername(username: string): string | null {
  if (!username) return 'Username is required.';
  if (username.length < 2 || username.length > 64) return 'Username must be 2–64 characters.';
  if (!/^[a-z0-9._-]+$/.test(username)) {
    return 'Username may only use letters, numbers, dots, underscores, and hyphens.';
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export function displayNameFor(user: Pick<StaffUser, 'firstName' | 'lastName' | 'displayName' | 'username'>): string {
  const full = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  if (full) return full;
  if (user.displayName?.trim()) return user.displayName.trim();
  return user.username;
}

export async function hashPassword(password: string, saltB64?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ? base64ToBytes(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  return {
    hash: bytesToBase64(bits),
    salt: bytesToBase64(salt)
  };
}

export async function verifyPassword(password: string, saltB64: string, hashB64: string): Promise<boolean> {
  const { hash } = await hashPassword(password, saltB64);
  if (hash.length !== hashB64.length) return false;
  let ok = 0;
  for (let i = 0; i < hash.length; i++) ok |= hash.charCodeAt(i) ^ hashB64.charCodeAt(i);
  return ok === 0;
}

function migrateUser(raw: StaffUser): StaffUser {
  const role: StaffRole = raw.role === 'admin' ? 'admin' : 'staff';
  return {
    ...raw,
    role,
    firstName: raw.firstName ?? (raw.displayName?.split(/\s+/)[0] || raw.username),
    lastName: raw.lastName ?? (raw.displayName?.split(/\s+/).slice(1).join(' ') || ''),
    bureau: raw.bureau ?? '',
    jobTitle: raw.jobTitle ?? '',
    email: raw.email ?? '',
    active: raw.active !== false,
    setupComplete: raw.setupComplete !== false,
    createdAt: raw.createdAt || new Date().toISOString()
  };
}

export async function loadUsers(env: Env): Promise<StaffUser[]> {
  if (env.PEERPOINT_KV) {
    const raw = await env.PEERPOINT_KV.get(USERS_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return (parsed as StaffUser[]).map(migrateUser);
    } catch {
      return [];
    }
  }
  return memoryUsers.map(migrateUser);
}

export async function saveUsers(env: Env, users: StaffUser[]): Promise<void> {
  if (env.PEERPOINT_KV) {
    await env.PEERPOINT_KV.put(USERS_KEY, JSON.stringify(users));
    return;
  }
  memoryUsers = users;
}

/** Idempotent: ensure seed Admin user exists with known password. */
export async function ensureSeedAdmin(env: Env): Promise<void> {
  const users = await loadUsers(env);
  if (users.some(u => u.username === SEED_ADMIN_USERNAME)) return;
  const { hash, salt } = await hashPassword(SEED_ADMIN_PASSWORD);
  users.push({
    username: SEED_ADMIN_USERNAME,
    role: 'admin',
    firstName: 'Admin',
    lastName: '',
    bureau: 'PEER Support',
    jobTitle: 'Administrator',
    email: 'admin@mypeerpoint.com',
    displayName: 'Admin',
    passwordHash: hash,
    salt,
    active: true,
    setupComplete: true,
    createdAt: new Date().toISOString()
  });
  await saveUsers(env, users);
}

export function toPublicAccount(u: StaffUser): PublicStaffAccount {
  return {
    username: u.username,
    role: u.role,
    firstName: u.firstName,
    lastName: u.lastName,
    bureau: u.bureau,
    jobTitle: u.jobTitle,
    email: u.email,
    sex: u.sex === 'male' || u.sex === 'female' ? u.sex : undefined,
    displayName: displayNameFor(u),
    active: u.active,
    setupComplete: u.setupComplete,
    createdAt: u.createdAt,
    isPeerSupportLeader: u.isPeerSupportLeader === true
  };
}

/** Active Peer Support Leaders (for fallback alerts). Excludes inactive / incomplete / seed Admin. */
export async function loadPeerSupportLeaders(env: Env): Promise<StaffUser[]> {
  const users = await loadUsers(env);
  return users.filter(
    u => u.active && u.setupComplete && u.isPeerSupportLeader === true && !isSeedAdminUsername(u.username)
  );
}

function inviteKey(token: string): string {
  return `${INVITE_PREFIX}${token}`;
}

function newOpaqueToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function loadInviteIndex(env: Env): Promise<InviteIndexEntry[]> {
  if (env.PEERPOINT_KV) {
    const raw = await env.PEERPOINT_KV.get(INVITES_INDEX_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as InviteIndexEntry[]) : [];
    } catch {
      return [];
    }
  }
  return [...memoryInviteIndex];
}

async function saveInviteIndex(env: Env, index: InviteIndexEntry[]): Promise<void> {
  if (env.PEERPOINT_KV) {
    await env.PEERPOINT_KV.put(INVITES_INDEX_KEY, JSON.stringify(index));
    return;
  }
  memoryInviteIndex = index;
}

export async function createInvite(
  env: Env,
  record: Omit<InviteRecord, 'createdAt'> & { createdAt?: string }
): Promise<{ token: string; invite: InviteRecord }> {
  const token = newOpaqueToken();
  const invite: InviteRecord = {
    ...record,
    email: normalizeEmail(record.email),
    createdAt: record.createdAt ?? new Date().toISOString()
  };
  if (env.PEERPOINT_KV) {
    await env.PEERPOINT_KV.put(inviteKey(token), JSON.stringify(invite), {
      expirationTtl: INVITE_TTL_SECONDS
    });
  } else {
    memoryInvites.set(token, invite);
  }
  const index = await loadInviteIndex(env);
  index.push({ ...invite, token });
  await saveInviteIndex(env, index);
  return { token, invite };
}

export async function getInvite(env: Env, token: string): Promise<InviteRecord | null> {
  if (!token) return null;
  if (env.PEERPOINT_KV) {
    const raw = await env.PEERPOINT_KV.get(inviteKey(token));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as InviteRecord;
    } catch {
      return null;
    }
  }
  return memoryInvites.get(token) ?? null;
}

export async function deleteInvite(env: Env, token: string): Promise<void> {
  if (env.PEERPOINT_KV) {
    await env.PEERPOINT_KV.delete(inviteKey(token));
  } else {
    memoryInvites.delete(token);
  }
  const index = (await loadInviteIndex(env)).filter(e => e.token !== token);
  await saveInviteIndex(env, index);
}

export async function listPendingInvites(env: Env): Promise<PublicPendingInvite[]> {
  const index = await loadInviteIndex(env);
  const out: PublicPendingInvite[] = [];
  for (const entry of index) {
    const live = await getInvite(env, entry.token);
    if (!live) continue;
    out.push({
      token: entry.token,
      email: live.email,
      role: live.role,
      firstName: live.firstName,
      lastName: live.lastName,
      bureau: live.bureau,
      jobTitle: live.jobTitle,
      createdAt: live.createdAt,
      invitedBy: live.invitedBy
    });
  }
  // Prune stale index entries
  if (out.length !== index.length) {
    await saveInviteIndex(
      env,
      out.map(p => ({
        token: p.token,
        email: p.email,
        role: p.role,
        firstName: p.firstName,
        lastName: p.lastName,
        bureau: p.bureau,
        jobTitle: p.jobTitle,
        invitedBy: p.invitedBy,
        createdAt: p.createdAt
      }))
    );
  }
  return out;
}

export function inviteSetupUrl(token: string, role: StaffRole): string {
  const origin = role === 'admin' ? ADMIN_ORIGIN : MEMBER_ORIGIN;
  return `${origin}/setup?token=${encodeURIComponent(token)}`;
}

function sessionKey(token: string): string {
  return `${SESSION_PREFIX}${token}`;
}

export async function createSession(
  env: Env,
  session: Omit<StaffSession, 'exp'>
): Promise<{ token: string; session: StaffSession }> {
  const exp = Date.now() + SESSION_TTL_SECONDS * 1000;
  const full: StaffSession = { ...session, exp };
  const token = newOpaqueToken();
  if (env.PEERPOINT_KV) {
    await env.PEERPOINT_KV.put(sessionKey(token), JSON.stringify(full), {
      expirationTtl: SESSION_TTL_SECONDS
    });
  } else {
    memorySessions.set(token, full);
  }
  return { token, session: full };
}

export async function getSession(env: Env, token: string): Promise<StaffSession | null> {
  if (!token) return null;
  let raw: string | null = null;
  if (env.PEERPOINT_KV) {
    raw = await env.PEERPOINT_KV.get(sessionKey(token));
  } else {
    const s = memorySessions.get(token);
    if (!s) return null;
    if (s.exp < Date.now()) {
      memorySessions.delete(token);
      return null;
    }
    return s;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StaffSession;
    if (!parsed?.role || !parsed.username || typeof parsed.exp !== 'number') return null;
    if (parsed.exp < Date.now()) {
      await revokeSession(env, token);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function revokeSession(env: Env, token: string): Promise<void> {
  if (env.PEERPOINT_KV) {
    await env.PEERPOINT_KV.delete(sessionKey(token));
    return;
  }
  memorySessions.delete(token);
}

export function bearerToken(request: Request): string | null {
  const auth = request.headers.get('Authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m ? m[1]!.trim() : null;
}

export async function requireSession(
  request: Request,
  env: Env
): Promise<{ session: StaffSession; token: string } | { error: string; status: number }> {
  const token = bearerToken(request);
  if (!token) return { error: 'Unauthorized.', status: 401 };
  const session = await getSession(env, token);
  if (!session) return { error: 'Unauthorized.', status: 401 };
  return { session, token };
}

export async function requireAdmin(
  request: Request,
  env: Env
): Promise<{ session: StaffSession; token: string } | { error: string; status: number }> {
  if (!isAdminHost(request)) return adminHostRequiredError();
  await ensureSeedAdmin(env);
  const result = await requireSession(request, env);
  if ('error' in result) return result;
  if (result.session.role !== 'admin') return { error: 'Admin access required.', status: 403 };
  return result;
}

/**
 * Queue APIs: staff or admin (admins inherit staff rights on any host).
 */
export async function requireStaffOrAdmin(
  request: Request,
  env: Env
): Promise<{ session: StaffSession; token: string } | { error: string; status: number }> {
  await ensureSeedAdmin(env);
  return requireSession(request, env);
}
