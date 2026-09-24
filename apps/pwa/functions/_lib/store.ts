/**
 * Shared helpers for Cloudflare Pages Functions.
 * Bindings: PEERPOINT_KV (required for staff accounts); secrets ABLY_API_KEY,
 * RESEND_API_KEY, INVITE_FROM_EMAIL, optional TEAMS_WEBHOOK_URL
 */

export type Env = {
  PEERPOINT_KV?: KVNamespace;
  ABLY_API_KEY?: string;
  /** Resend API key for invite emails. */
  RESEND_API_KEY?: string;
  /** Verified From address in Resend (e.g. invites@mypeerpoint.com). */
  INVITE_FROM_EMAIL?: string;
  TEAMS_WEBHOOK_URL?: string;
  /** Shared secret for /api/cron/* (GitHub Actions or external scheduler). */
  CRON_SECRET?: string;
  /** Optional Twilio SMS for room join links. */
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  /** E.164 Twilio number, e.g. +18015551234 */
  TWILIO_FROM_NUMBER?: string;
  /**
   * Optional Twilio trial Body template name (e.g. sms_event_notifications).
   * Used only when custom PEERPoint SMS is blocked (error 572006).
   */
  TWILIO_TRIAL_SMS_TEMPLATE?: string;
  /** LiveKit server URL and signing credentials. Never expose API secret to clients. */
  LIVEKIT_URL?: string;
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
  /**
   * Pause all email/SMS to Peer Support staff.
   * Default when unset: paused. Set to "0" to re-enable.
   */
  PEERPOINT_PAUSE_STAFF_NOTIFY?: string;
  /**
   * Bearer / X-Integration-Secret for Power Automate and SharePoint sync (GET peer support events).
   * Falls back to CRON_SECRET when unset.
   */
  PEERPOINT_INTEGRATION_SECRET?: string;
};

export type HelpRequest = {
  id: string;
  submittedAt: string;
  requesterName?: string;
  requesterPhone: string;
  requesterEmail: string;
  preferredContact?: string;
  description?: string;
  consentAcknowledged: boolean;
  /** open = follow-up; queued = waiting for on-call accept; assigned = live room; closed */
  status: 'open' | 'queued' | 'assigned' | 'closed';
  roomCode?: string;
  assignedPeer?: string;
  /** Staff username (internal; not shown to members). */
  assignedPeerUsername?: string;
  /** Member preference for immediate contact. */
  preferredPeerSex?: 'male' | 'female';
  /** Member match mode: anyone | specific person | civilian/sworn. */
  matchMode?: 'anyone' | 'specific' | 'classification';
  preferredPeerUsername?: string;
  preferredPeerClassification?: 'civilian' | 'sworn';
  contactMode?: 'chat' | 'voice' | 'form' | 'faceToFace';
  /** Self-attested current SLCOSO employment (no employee ID stored). */
  employmentAttested?: boolean;
  bureau?: string;
  employmentType?: 'civilian' | 'sworn';
  /** ISO time when the room code was issued (assign / accept). */
  roomIssuedAt?: string;
  /** ISO time of last chat/voice use (Ably token). Idle expiry uses this. */
  roomLastUsedAt?: string;
  /** Opaque token so the member can poll/join without seeing the room code. */
  memberJoinToken?: string;
  /** Six-digit, display-only identifier for Modern peer-support sessions. */
  publicSupportCode?: string;
  /** Opaque identity for an anonymous Modern peer-support session. */
  anonymousSessionId?: string;
  sessionKind?: 'classic' | 'modern';
  /** Ably channel scoped to this Modern peer-support request. */
  ablyChannelName?: string;
  /** LiveKit room scoped to this Modern peer-support request. */
  livekitRoomName?: string;
  closeReason?: string;
  closedAt?: string;
  callState?: string;
  expiresAt?: string;
  lastActivityAt?: string;
  /** ISO time when email/SMS join links were sent (avoid duplicate sends on Accept). */
  roomNotifySentAt?: string;
  queuedAt?: string;
  acceptedAt?: string;
  /** Display name the member chose for chat/voice. */
  memberDisplayName?: string;
  /** Staff notes on this request (visible to Staff/Admin; used in reports). */
  notes?: RequestNote[];
  /** Time-spent entries logged by assigned staff (minutes). */
  timeEntries?: TimeEntry[];
};

export type RequestNote = {
  id: string;
  text: string;
  createdAt: string;
  createdBy: string;
  createdByDisplay: string;
};

export type TimeEntry = {
  id: string;
  minutes: number;
  note?: string;
  createdAt: string;
  createdBy: string;
  createdByDisplay: string;
};

/** Room codes expire after this much idle time (no Ably token / join activity). */
/** Room codes stay valid for 24 hours from last use (Ably join / token). */
export const ROOM_IDLE_TTL_MS = 24 * 60 * 60 * 1000;

const REQUESTS_KEY = 'peerpoint:requests';
const STAFF_ON_DUTY_KEY = 'peerpoint:on_duty';
const ON_CALL_KEY = 'peerpoint:on_call';
const CONTACT_LOG_KEY = 'peerpoint:contact_logs';

/** Keep finished shifts for reporting / history. */
const ON_CALL_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export type OnCallSlot = {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'staff';
  sex?: 'male' | 'female';
  /** ISO start (inclusive). */
  startAt: string;
  /** ISO end (exclusive). */
  endAt: string;
  createdBy: string;
  createdAt: string;
  /** Staff acknowledged they will be available for this block. */
  availabilityAcknowledged: boolean;
  availabilityAcknowledgedAt?: string;
  /**
   * What this On Call block covers.
   * - remote: chat & voice only
   * - inPerson: face-to-face only
   * - both: chat/voice and face-to-face
   * Missing on older slots = both.
   */
  modalities?: 'remote' | 'inPerson' | 'both';
};

let memoryRequests: HelpRequest[] = [];
let memoryContactLogs: ContactLogStore = { months: {} };
let memoryOnDuty: string[] = [];
let memoryOnCall: OnCallSlot[] = [];

export function corsHeaders(origin: string | null): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Integration-Secret',
    'Content-Type': 'application/json'
  };
}

export function json(data: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(origin) });
}

export async function loadRequests(env: Env): Promise<HelpRequest[]> {
  if (env.PEERPOINT_KV) {
    const raw = await env.PEERPOINT_KV.get(REQUESTS_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as HelpRequest[]) : [];
    } catch {
      return [];
    }
  }
  return memoryRequests;
}

export async function saveRequests(env: Env, list: HelpRequest[]): Promise<void> {
  if (env.PEERPOINT_KV) {
    await env.PEERPOINT_KV.put(REQUESTS_KEY, JSON.stringify(list));
    return;
  }
  memoryRequests = list;
}

export async function loadOnDuty(env: Env): Promise<string[]> {
  if (env.PEERPOINT_KV) {
    const raw = await env.PEERPOINT_KV.get(STAFF_ON_DUTY_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as string[]).map(String) : [];
    } catch {
      return [];
    }
  }
  return memoryOnDuty;
}

export async function saveOnDuty(env: Env, names: string[]): Promise<void> {
  if (env.PEERPOINT_KV) {
    await env.PEERPOINT_KV.put(STAFF_ON_DUTY_KEY, JSON.stringify(names));
    return;
  }
  memoryOnDuty = names;
}

export async function loadOnCallSlots(env: Env): Promise<OnCallSlot[]> {
  if (env.PEERPOINT_KV) {
    const raw = await env.PEERPOINT_KV.get(ON_CALL_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return (parsed as OnCallSlot[])
        .filter(
          s =>
            s &&
            typeof s.id === 'string' &&
            typeof s.username === 'string' &&
            typeof s.startAt === 'string' &&
            typeof s.endAt === 'string'
        )
        .map(s => ({
          id: s.id,
          username: s.username,
          displayName: String(s.displayName || s.username),
          role: s.role === 'admin' ? 'admin' : 'staff',
          sex: s.sex === 'male' || s.sex === 'female' ? s.sex : undefined,
          startAt: s.startAt,
          endAt: s.endAt,
          createdBy: String(s.createdBy || ''),
          createdAt: String(s.createdAt || s.startAt)
        }));
    } catch {
      return [];
    }
  }
  return memoryOnCall;
}

export async function saveOnCallSlots(env: Env, slots: OnCallSlot[]): Promise<void> {
  const pruned = pruneOnCallSlots(slots);
  if (env.PEERPOINT_KV) {
    await env.PEERPOINT_KV.put(ON_CALL_KEY, JSON.stringify(pruned));
    return;
  }
  memoryOnCall = pruned;
}

export function pruneOnCallSlots(slots: OnCallSlot[], now = Date.now()): OnCallSlot[] {
  const cutoff = now - ON_CALL_RETENTION_MS;
  return slots
    .filter(s => {
      const end = Date.parse(s.endAt);
      return Number.isFinite(end) && end >= cutoff;
    })
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
}

/** Slots active at `at` (start <= at < end). */
export function onCallActiveAt(slots: OnCallSlot[], at = new Date()): OnCallSlot[] {
  const t = at.getTime();
  return slots.filter(s => {
    const start = Date.parse(s.startAt);
    const end = Date.parse(s.endAt);
    return Number.isFinite(start) && Number.isFinite(end) && start <= t && t < end;
  });
}

/** Slots overlapping [rangeStart, rangeEnd). */
export function onCallOverlappingRange(
  slots: OnCallSlot[],
  rangeStart: Date,
  rangeEnd: Date
): OnCallSlot[] {
  const a = rangeStart.getTime();
  const b = rangeEnd.getTime();
  return slots.filter(s => {
    const start = Date.parse(s.startAt);
    const end = Date.parse(s.endAt);
    return Number.isFinite(start) && Number.isFinite(end) && start < b && end > a;
  });
}

export function newId(): string {
  return crypto.randomUUID();
}

export function randomRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (let i = 0; i < 6; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

export function randomPublicSupportCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String(bytes[i]! % 10);
  return out;
}

export function ablyChannelForRequest(requestId: string): string {
  return `peer-support:session:${requestId}`;
}

export function livekitRoomForRequest(requestId: string): string {
  return `peer-support-${requestId}`;
}

function roomActivityMs(r: HelpRequest): number | null {
  const raw = r.roomLastUsedAt || r.roomIssuedAt;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

/** True if this request has a room code that is still within the idle TTL. */
export function isRoomCodeActive(r: HelpRequest, now = Date.now()): boolean {
  if (!r.roomCode || r.status === 'closed') return false;
  const activity = roomActivityMs(r);
  if (activity == null) return false;
  return now - activity < ROOM_IDLE_TTL_MS;
}

export function clearExpiredRoom(r: HelpRequest): HelpRequest {
  return {
    ...r,
    roomCode: undefined,
    roomIssuedAt: undefined,
    roomLastUsedAt: undefined
  };
}

/** Drop idle room codes older than ROOM_IDLE_TTL_MS. Returns whether any row changed. */
export function expireIdleRooms(list: HelpRequest[], now = Date.now()): {
  list: HelpRequest[];
  changed: boolean;
} {
  let changed = false;
  const next = list.map(r => {
    if (!r.roomCode) return r;
    if (isRoomCodeActive(r, now)) return r;
    changed = true;
    return clearExpiredRoom(r);
  });
  return { list: next, changed };
}

export function findActiveRequestByRoom(
  list: HelpRequest[],
  roomCode: string,
  now = Date.now()
): HelpRequest | null {
  const code = roomCode.trim().toUpperCase();
  for (const r of list) {
    if (!r.roomCode || r.roomCode.toUpperCase() !== code) continue;
    if (isRoomCodeActive(r, now)) return r;
  }
  return null;
}

export async function notifyTeams(env: Env, text: string): Promise<void> {
  const url = env.TEAMS_WEBHOOK_URL?.trim();
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
  } catch {
    /* best-effort */
  }
}

/**
 * Issue an Ably TokenDetails via REST so the browser never sees the API key.
 * @see https://ably.com/docs/api/rest-api#request-access-token
 */
export async function createAblyTokenDetails(
  apiKey: string,
  clientId: string,
  channel: string
): Promise<unknown> {
  return createAblyTokenDetailsForChannels(apiKey, clientId, {
    [channel]: ['subscribe', 'publish', 'presence', 'history']
  });
}

export async function createAblyTokenDetailsForChannels(
  apiKey: string,
  clientId: string,
  capability: Record<string, string[]>
): Promise<unknown> {
  const colon = apiKey.indexOf(':');
  if (colon < 1) throw new Error('ABLY_API_KEY must be in keyName:keySecret format');
  const keyName = apiKey.slice(0, colon);
  const keySecret = apiKey.slice(colon + 1);
  const basic = btoa(`${keyName}:${keySecret}`);
  const res = await fetch(`https://rest.ably.io/keys/${encodeURIComponent(keyName)}/requestToken`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      clientId,
      capability: JSON.stringify(capability),
      ttl: 60 * 60 * 1000
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ably token failed (${res.status}): ${errText.slice(0, 240)}`);
  }
  return res.json();
}

export const CONTACT_TYPES = ['outreach', 'walkIn', 'supervisorReferral', 'ciResponse'] as const;
export const RESOURCE_TYPES = ['vestEap', 'handout'] as const;
export type ContactTypeKey = (typeof CONTACT_TYPES)[number];
export type ResourceTypeKey = (typeof RESOURCE_TYPES)[number];

export type MonthContactLog = {
  year: number;
  month: number;
  contacts: Record<ContactTypeKey, number[]>;
  resources: Record<ResourceTypeKey, number[]>;
  updatedAt: string;
  updatedBy: string;
  updatedByDisplay: string;
};

export type ContactLogStore = {
  months: Record<string, MonthContactLog>;
};

export function contactLogMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function emptyCounts(): number[] {
  return Array.from({ length: 31 }, () => 0);
}

export function emptyMonthLog(year: number, month: number): MonthContactLog {
  return {
    year,
    month,
    contacts: {
      outreach: emptyCounts(),
      walkIn: emptyCounts(),
      supervisorReferral: emptyCounts(),
      ciResponse: emptyCounts()
    },
    resources: {
      vestEap: emptyCounts(),
      handout: emptyCounts()
    },
    updatedAt: '',
    updatedBy: '',
    updatedByDisplay: ''
  };
}

function clampCount(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 999);
}

function normalizeCountRow(raw: unknown, dim: number): number[] {
  const src = Array.isArray(raw) ? raw : [];
  return Array.from({ length: 31 }, (_, i) => (i < dim ? clampCount(src[i]) : 0));
}

export function normalizeMonthLog(
  year: number,
  month: number,
  raw: Partial<MonthContactLog> | undefined
): MonthContactLog {
  const dim = daysInMonth(year, month);
  const base = emptyMonthLog(year, month);
  if (!raw) return base;
  return {
    year,
    month,
    contacts: {
      outreach: normalizeCountRow(raw.contacts?.outreach, dim),
      walkIn: normalizeCountRow(raw.contacts?.walkIn, dim),
      supervisorReferral: normalizeCountRow(raw.contacts?.supervisorReferral, dim),
      ciResponse: normalizeCountRow(raw.contacts?.ciResponse, dim)
    },
    resources: {
      vestEap: normalizeCountRow(raw.resources?.vestEap, dim),
      handout: normalizeCountRow(raw.resources?.handout, dim)
    },
    updatedAt: String(raw.updatedAt ?? ''),
    updatedBy: String(raw.updatedBy ?? ''),
    updatedByDisplay: String(raw.updatedByDisplay ?? '')
  };
}

export async function loadContactLogs(env: Env): Promise<ContactLogStore> {
  if (env.PEERPOINT_KV) {
    const raw = await env.PEERPOINT_KV.get(CONTACT_LOG_KEY);
    if (!raw) return { months: {} };
    try {
      const parsed = JSON.parse(raw) as ContactLogStore;
      if (!parsed || typeof parsed !== 'object' || !parsed.months) return { months: {} };
      return parsed;
    } catch {
      return { months: {} };
    }
  }
  return memoryContactLogs;
}

export async function saveContactLogs(env: Env, store: ContactLogStore): Promise<void> {
  if (env.PEERPOINT_KV) {
    await env.PEERPOINT_KV.put(CONTACT_LOG_KEY, JSON.stringify(store));
    return;
  }
  memoryContactLogs = store;
}

const PEER_SUPPORT_EVENTS_KEY = 'peerpoint:peer_support_events';
const PEER_SUPPORT_HELP_TYPES_KEY = 'peerpoint:peer_support_help_types';

export const DEFAULT_PEER_SUPPORT_HELP_TYPES = [
  'Crisis / immediate support',
  'Follow-up check-in',
  'Supervisor referral response',
  'Outreach or walk-in',
  'Resource referral (EAP / VEST)',
  'Other'
] as const;

export type PrpsGender = 'male' | 'female' | 'nonBinary' | 'preferNotToSay' | 'unknown';

export type PeerSupportEvent = {
  id: string;
  /** Calendar date of the peer support interaction (YYYY-MM-DD). */
  eventDate: string;
  recordedAt: string;
  prpsBureau: string;
  prpsGender: PrpsGender;
  helpType: string;
  providerDisplayName: string;
  providerUsername: string;
  totalMinutes: number;
  createdBy: string;
  createdByDisplay: string;
  /** Set when SharePoint sync marks this row imported (optional). */
  sharePointImportedAt?: string;
};

export type PeerSupportEventStore = {
  events: PeerSupportEvent[];
};

/** How long staff see logged events in the app (SharePoint is the long-term record). */
export const PEER_SUPPORT_EVENT_APP_RETENTION_MS = 5 * 24 * 60 * 60 * 1000;

let memoryPeerSupportEvents: PeerSupportEventStore = { events: [] };
let memoryHelpTypes: string[] = [...DEFAULT_PEER_SUPPORT_HELP_TYPES];

const PRPS_GENDERS: PrpsGender[] = ['male', 'female', 'nonBinary', 'preferNotToSay', 'unknown'];

export function normalizePrpsGender(raw: unknown): PrpsGender | null {
  const s = String(raw ?? '').trim();
  if (PRPS_GENDERS.includes(s as PrpsGender)) return s as PrpsGender;
  const lower = s.toLowerCase();
  if (lower === 'm' || lower === 'male') return 'male';
  if (lower === 'f' || lower === 'female') return 'female';
  if (lower === 'non-binary' || lower === 'nonbinary') return 'nonBinary';
  if (lower === 'prefer not to say') return 'preferNotToSay';
  if (lower === 'unknown') return 'unknown';
  return null;
}

export function normalizeHelpTypes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_PEER_SUPPORT_HELP_TYPES];
  const out = raw
    .map(v => String(v ?? '').trim())
    .filter(Boolean);
  const unique = [...new Set(out)];
  return unique.length ? unique : [...DEFAULT_PEER_SUPPORT_HELP_TYPES];
}

export async function loadPeerSupportHelpTypes(env: Env): Promise<string[]> {
  if (env.PEERPOINT_KV) {
    const raw = await env.PEERPOINT_KV.get(PEER_SUPPORT_HELP_TYPES_KEY);
    if (!raw) return [...DEFAULT_PEER_SUPPORT_HELP_TYPES];
    try {
      return normalizeHelpTypes(JSON.parse(raw));
    } catch {
      return [...DEFAULT_PEER_SUPPORT_HELP_TYPES];
    }
  }
  return memoryHelpTypes.length ? memoryHelpTypes : [...DEFAULT_PEER_SUPPORT_HELP_TYPES];
}

export async function savePeerSupportHelpTypes(env: Env, types: string[]): Promise<void> {
  const normalized = normalizeHelpTypes(types);
  if (env.PEERPOINT_KV) {
    await env.PEERPOINT_KV.put(PEER_SUPPORT_HELP_TYPES_KEY, JSON.stringify(normalized));
    return;
  }
  memoryHelpTypes = normalized;
}

export async function loadPeerSupportEvents(env: Env): Promise<PeerSupportEventStore> {
  if (env.PEERPOINT_KV) {
    const raw = await env.PEERPOINT_KV.get(PEER_SUPPORT_EVENTS_KEY);
    if (!raw) return { events: [] };
    try {
      const parsed = JSON.parse(raw) as PeerSupportEventStore;
      if (!parsed || !Array.isArray(parsed.events)) return { events: [] };
      return { events: parsed.events.filter(e => e && typeof e.id === 'string') };
    } catch {
      return { events: [] };
    }
  }
  return memoryPeerSupportEvents;
}

export async function savePeerSupportEvents(env: Env, store: PeerSupportEventStore): Promise<void> {
  if (env.PEERPOINT_KV) {
    await env.PEERPOINT_KV.put(PEER_SUPPORT_EVENTS_KEY, JSON.stringify(store));
    return;
  }
  memoryPeerSupportEvents = store;
}

export function peerSupportEventRecordedMs(e: PeerSupportEvent): number {
  const t = Date.parse(e.recordedAt);
  return Number.isFinite(t) ? t : 0;
}

/** Drop events older than 5 days once SharePoint sync marked them imported. */
export function purgePeerSupportEventsSyncedAndExpired(
  store: PeerSupportEventStore,
  now = Date.now()
): { store: PeerSupportEventStore; removed: number } {
  const cutoff = now - PEER_SUPPORT_EVENT_APP_RETENTION_MS;
  const before = store.events.length;
  const events = store.events.filter(e => {
    const recorded = peerSupportEventRecordedMs(e);
    if (recorded >= cutoff) return true;
    if (!e.sharePointImportedAt?.trim()) return true;
    return false;
  });
  return { store: { events }, removed: before - events.length };
}

export function markPeerSupportEventsImported(
  store: PeerSupportEventStore,
  ids: string[],
  importedAt = new Date().toISOString()
): number {
  const idSet = new Set(ids.map(id => id.trim()).filter(Boolean));
  let marked = 0;
  const events = store.events.map(e => {
    if (!idSet.has(e.id) || e.sharePointImportedAt) return e;
    marked += 1;
    return { ...e, sharePointImportedAt: importedAt };
  });
  store.events = events;
  return marked;
}

/** Staff app list: last 5 days; staff see rows they logged or where they are the provider. */
export function filterPeerSupportEventsForStaffApp(
  events: PeerSupportEvent[],
  session: { username: string; role: 'admin' | 'staff' },
  now = Date.now()
): PeerSupportEvent[] {
  const cutoff = now - PEER_SUPPORT_EVENT_APP_RETENTION_MS;
  const me = session.username.trim().toLowerCase();
  return events.filter(e => {
    if (peerSupportEventRecordedMs(e) < cutoff) return false;
    if (session.role === 'admin') return true;
    const createdBy = String(e.createdBy ?? '').trim().toLowerCase();
    const provider = String(e.providerUsername ?? '').trim().toLowerCase();
    return createdBy === me || provider === me;
  });
}

export async function loadAndMaintainPeerSupportEvents(env: Env): Promise<PeerSupportEventStore> {
  const store = await loadPeerSupportEvents(env);
  const { store: next, removed } = purgePeerSupportEventsSyncedAndExpired(store);
  if (removed > 0) await savePeerSupportEvents(env, next);
  return next;
}

export function integrationSecret(env: Env): string {
  return env.PEERPOINT_INTEGRATION_SECRET?.trim() || env.CRON_SECRET?.trim() || '';
}

export function integrationAuthorized(request: Request, env: Env): boolean {
  const secret = integrationSecret(env);
  if (!secret) return false;
  const header = request.headers.get('Authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const alt = request.headers.get('X-Integration-Secret')?.trim() || '';
  return bearer === secret || alt === secret;
}

export function parseEventDate(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(`${s}T12:00:00.000Z`);
  if (!Number.isFinite(t)) return null;
  return s;
}

export function clampEventMinutes(raw: unknown): number | null {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(n, 24 * 60);
}
