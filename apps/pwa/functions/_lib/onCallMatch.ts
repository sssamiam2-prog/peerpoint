/**
 * Shared On Call matching for peer queue / immediate contact.
 *
 * Selection rules:
 * - Only peers currently on call for remote (chat/voice)
 * - Skip peers marked Unavailable (in a session / supporting someone)
 * - Skip peers already offered a waiting queue item or holding an assigned room
 * - Prefer peers who have taken fewer chat/voice sessions (fair rotation)
 * - Optional filters: specific username, civilian/sworn classification
 */

import { isPeerAvailable } from './peerAvailability';
import {
  displayNameFor,
  isOperationalPeer,
  loadUsers,
  type EmploymentClassification,
  type StaffSex,
  type StaffUser
} from './staffAuth';
import {
  loadOnCallSlots,
  loadRequests,
  onCallActiveAt,
  type Env,
  type HelpRequest,
  type OnCallSlot
} from './store';

export type SexPreference = StaffSex | 'either';

export type MatchMode = 'anyone' | 'specific' | 'classification';

export type MatchPreference = {
  mode: MatchMode;
  /** For mode=specific */
  preferredUsername?: string;
  /** For mode=classification */
  preferredClassification?: EmploymentClassification;
  /** Optional legacy sex filter (applied after mode filter). */
  sexPreference?: SexPreference;
};

export type OnCallModality = 'remote' | 'inPerson' | 'both';

export type MatchCandidate = {
  slot: OnCallSlot;
  user: StaffUser;
  sex?: StaffSex;
  displayName: string;
  classification?: EmploymentClassification;
};

export type PublicPeerOption = {
  username: string;
  displayName: string;
  firstName: string;
  bureau: string;
  sex?: StaffSex;
  classification?: EmploymentClassification;
};

export function normalizeOnCallModality(raw: unknown): OnCallModality {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (v === 'remote') return 'remote';
  if (v === 'inperson' || v === 'in-person' || v === 'face' || v === 'facetoface') return 'inPerson';
  if (v === 'both' || v === 'all') return 'both';
  return 'both';
}

export function slotSupportsRemote(slot: OnCallSlot): boolean {
  const m = slot.modalities ?? 'both';
  return m === 'remote' || m === 'both';
}

export function slotSupportsInPerson(slot: OnCallSlot): boolean {
  const m = slot.modalities ?? 'both';
  return m === 'inPerson' || m === 'both';
}

export function modalityLabel(slot: OnCallSlot): string {
  const m = slot.modalities ?? 'both';
  if (m === 'remote') return 'Chat & voice only';
  if (m === 'inPerson') return 'Face to face only';
  return 'Chat/voice + face to face';
}

function resolveSex(slot: OnCallSlot, user: StaffUser): StaffSex | undefined {
  const sex = slot.sex ?? user.sex;
  return sex === 'male' || sex === 'female' ? sex : undefined;
}

function resolveClassification(user: StaffUser): EmploymentClassification | undefined {
  return user.employmentClassification === 'civilian' || user.employmentClassification === 'sworn'
    ? user.employmentClassification
    : undefined;
}

function candidatesFromSlots(
  slots: OnCallSlot[],
  users: StaffUser[],
  filter: (slot: OnCallSlot) => boolean
): MatchCandidate[] {
  const byUser = new Map(users.map(u => [u.username, u]));
  const seen = new Set<string>();
  const out: MatchCandidate[] = [];
  for (const slot of slots) {
    if (!filter(slot)) continue;
    const u = byUser.get(slot.username);
    if (!u || !isOperationalPeer(u)) continue;
    if (!isPeerAvailable(u)) continue;
    const key = u.username.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      slot,
      user: u,
      sex: resolveSex(slot, u),
      displayName: displayNameFor(u),
      classification: resolveClassification(u)
    });
  }
  return out;
}

/** Free on-call peers available for chat/voice. */
export function freeOnCallCandidates(slots: OnCallSlot[], users: StaffUser[]): MatchCandidate[] {
  return candidatesFromSlots(slots, users, slotSupportsRemote);
}

/** Free on-call peers available for face-to-face. */
export function freeInPersonOnCallCandidates(slots: OnCallSlot[], users: StaffUser[]): MatchCandidate[] {
  return candidatesFromSlots(slots, users, slotSupportsInPerson);
}

export function toPublicPeerOptions(candidates: MatchCandidate[]): PublicPeerOption[] {
  return candidates
    .map(c => ({
      username: c.user.username,
      displayName: c.displayName,
      firstName: c.user.firstName || c.displayName.split(/\s+/)[0] || c.user.username,
      bureau: c.user.bureau || '',
      sex: c.sex,
      classification: c.classification
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Usernames currently supporting a member (assigned room) or already offered a queue item. */
export function busyOnCallUsernames(requests: HelpRequest[]): Set<string> {
  const busy = new Set<string>();
  for (const r of requests) {
    const u = String(r.assignedPeerUsername ?? '')
      .trim()
      .toLowerCase();
    if (!u) continue;
    if (r.status === 'assigned' && r.roomCode) busy.add(u);
    if (r.status === 'queued') busy.add(u);
  }
  return busy;
}

type SessionLoad = { count: number; lastAt: number };

/** How many chat/voice sessions each peer has taken (accepted or room issued). */
export function sessionLoadByUsername(requests: HelpRequest[]): Map<string, SessionLoad> {
  const map = new Map<string, SessionLoad>();
  for (const r of requests) {
    const u = String(r.assignedPeerUsername ?? '')
      .trim()
      .toLowerCase();
    if (!u) continue;
    const isLiveSession =
      (r.contactMode === 'chat' ||
        r.contactMode === 'voice' ||
        r.preferredContact === 'chat' ||
        r.preferredContact === 'voice') &&
      Boolean(r.acceptedAt || r.roomIssuedAt);
    if (!isLiveSession) continue;
    if (r.status !== 'assigned' && r.status !== 'closed') continue;
    const at = new Date(r.acceptedAt || r.roomIssuedAt || r.submittedAt).getTime();
    const prev = map.get(u) ?? { count: 0, lastAt: 0 };
    map.set(u, {
      count: prev.count + 1,
      lastAt: Math.max(prev.lastAt, Number.isFinite(at) ? at : 0)
    });
  }
  return map;
}

function sortFairNextInLine(
  a: MatchCandidate,
  b: MatchCandidate,
  load: Map<string, SessionLoad>
): number {
  const aKey = a.user.username.toLowerCase();
  const bKey = b.user.username.toLowerCase();
  const aLoad = load.get(aKey) ?? { count: 0, lastAt: 0 };
  const bLoad = load.get(bKey) ?? { count: 0, lastAt: 0 };
  if (aLoad.count !== bLoad.count) return aLoad.count - bLoad.count;
  if (aLoad.lastAt !== bLoad.lastAt) return aLoad.lastAt - bLoad.lastAt;
  const startDiff = new Date(a.slot.startAt).getTime() - new Date(b.slot.startAt).getTime();
  if (startDiff !== 0) return startDiff;
  const createdDiff = new Date(a.slot.createdAt).getTime() - new Date(b.slot.createdAt).getTime();
  if (createdDiff !== 0) return createdDiff;
  return a.user.username.localeCompare(b.user.username);
}

export type PickNextOptions = {
  /** Do not offer to these usernames (e.g. peer who just declined). */
  excludeUsernames?: string[];
};

export function parseMatchPreference(body: Record<string, unknown>): MatchPreference | { error: string } {
  const modeRaw = String(body.matchMode ?? body.peerChoice ?? 'anyone')
    .trim()
    .toLowerCase();
  let mode: MatchMode = 'anyone';
  if (modeRaw === 'specific' || modeRaw === 'person' || modeRaw === 'pick') mode = 'specific';
  else if (modeRaw === 'classification' || modeRaw === 'civilian' || modeRaw === 'sworn') {
    mode = 'classification';
  } else if (
    modeRaw === 'anyone' ||
    modeRaw === 'either' ||
    modeRaw === 'any' ||
    modeRaw === 'sex' ||
    modeRaw === ''
  ) {
    mode = 'anyone';
  } else {
    return { error: 'Choose who to talk to: anyone, a specific peer, or a sex preference.' };
  }

  const preferredUsername = String(body.preferredUsername ?? body.peerUsername ?? '')
    .trim()
    .toLowerCase();
  let preferredClassification: EmploymentClassification | undefined;
  const classRaw = String(body.preferredClassification ?? body.employmentClassification ?? body.matchMode ?? '')
    .trim()
    .toLowerCase();
  if (classRaw === 'civilian' || classRaw === 'sworn') preferredClassification = classRaw;
  if (mode === 'classification' && !preferredClassification) {
    const alt = String(body.peerChoiceDetail ?? body.classification ?? '')
      .trim()
      .toLowerCase();
    if (alt === 'civilian' || alt === 'sworn') preferredClassification = alt;
  }

  if (mode === 'specific' && !preferredUsername) {
    return { error: 'Select a peer support person to talk to.' };
  }
  if (mode === 'classification' && !preferredClassification) {
    return { error: 'Choose Civilian or Sworn.' };
  }

  const sexRaw = String(body.sexPreference ?? 'either')
    .trim()
    .toLowerCase();
  const sexPreference = (sexRaw === 'any' ? 'either' : sexRaw) as SexPreference;
  if (sexPreference !== 'male' && sexPreference !== 'female' && sexPreference !== 'either') {
    return { error: 'Invalid peer preference.' };
  }

  return {
    mode,
    preferredUsername: preferredUsername || undefined,
    preferredClassification,
    sexPreference
  };
}

export async function pickNextOnCallPeer(
  env: Env,
  preference: SexPreference | MatchPreference = 'either',
  opts: PickNextOptions = {}
): Promise<
  | { ok: true; chosen: MatchCandidate; freeCount: number; onCallCount: number }
  | { ok: false; error: string; freeCount: number; onCallCount: number }
> {
  const pref: MatchPreference =
    typeof preference === 'string'
      ? { mode: 'anyone', sexPreference: preference }
      : preference;
  const sexPreference = pref.sexPreference ?? 'either';

  const slots = onCallActiveAt(await loadOnCallSlots(env));
  const users = await loadUsers(env);
  const requests = await loadRequests(env);
  const busy = busyOnCallUsernames(requests);
  for (const raw of opts.excludeUsernames ?? []) {
    const u = String(raw ?? '')
      .trim()
      .toLowerCase();
    if (u) busy.add(u);
  }
  const load = sessionLoadByUsername(requests);

  const freeAll = freeOnCallCandidates(slots, users);
  const free = freeAll.filter(c => !busy.has(c.user.username.toLowerCase()));
  const onCallCount = new Set(slots.filter(slotSupportsRemote).map(s => s.username.toLowerCase())).size;

  let matches = free.filter(c => (sexPreference === 'either' ? true : c.sex === sexPreference));

  if (pref.mode === 'specific' && pref.preferredUsername) {
    matches = matches.filter(c => c.user.username.toLowerCase() === pref.preferredUsername);
  } else if (pref.mode === 'classification' && pref.preferredClassification) {
    matches = matches.filter(c => c.classification === pref.preferredClassification);
  }

  if (matches.length === 0) {
    let error: string;
    if (onCallCount > 0 && freeAll.length === 0) {
      error =
        'Peers are on call but all are currently marked Unavailable. Try again shortly, or use Request Help for follow-up.';
    } else if (onCallCount > 0 && free.length === 0) {
      error =
        'Peers are on call but all are already in a chat/voice session or waiting on another request. Try again shortly.';
    } else if (pref.mode === 'specific') {
      error = 'That peer is not free on call right now. Pick someone else, or choose “I just need to talk.”';
    } else if (pref.mode === 'classification' && pref.preferredClassification === 'civilian') {
      error = 'No civilian peer is free on call right now. Try Sworn, pick a person, or “I just need to talk.”';
    } else if (pref.mode === 'classification' && pref.preferredClassification === 'sworn') {
      error = 'No sworn peer is free on call right now. Try Civilian, pick a person, or “I just need to talk.”';
    } else if (sexPreference === 'male') {
      error = 'No male peer is free on call right now. Try again shortly, or submit a follow-up request.';
    } else if (sexPreference === 'female') {
      error = 'No female peer is free on call right now. Try again shortly, or submit a follow-up request.';
    } else {
      error = 'No peer is free on call right now. Peer Support Leaders have been notified when available.';
    }
    return { ok: false, error, freeCount: free.length, onCallCount };
  }

  matches.sort((a, b) => sortFairNextInLine(a, b, load));
  return { ok: true, chosen: matches[0]!, freeCount: free.length, onCallCount };
}

export function availabilityCounts(
  freeRemote: MatchCandidate[],
  freeInPerson: MatchCandidate[] = []
): {
  maleAvailable: number;
  femaleAvailable: number;
  eitherAvailable: number;
  faceToFaceAvailable: number;
  civilianAvailable: number;
  swornAvailable: number;
  peers: PublicPeerOption[];
} {
  let male = 0;
  let female = 0;
  let civilian = 0;
  let sworn = 0;
  for (const c of freeRemote) {
    if (c.sex === 'male') male += 1;
    else if (c.sex === 'female') female += 1;
    if (c.classification === 'civilian') civilian += 1;
    else if (c.classification === 'sworn') sworn += 1;
  }
  return {
    maleAvailable: male,
    femaleAvailable: female,
    eitherAvailable: freeRemote.length,
    faceToFaceAvailable: freeInPerson.length,
    civilianAvailable: civilian,
    swornAvailable: sworn,
    peers: toPublicPeerOptions(freeRemote)
  };
}
