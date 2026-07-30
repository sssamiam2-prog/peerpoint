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
let memoryOnDuty: string[] = [];
let memoryOnCall: OnCallSlot[] = [];

export function corsHeaders(origin: string | null): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
