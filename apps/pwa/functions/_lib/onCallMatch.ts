/**
 * Shared On Call matching for peer queue / immediate contact.
 */

import { onCallActiveAt, type OnCallSlot } from './store';
import { isPeerAvailable } from './peerAvailability';
import {
  displayNameFor,
  isOperationalPeer,
  loadUsers,
  type StaffSex,
  type StaffUser
} from './staffAuth';
import type { Env } from './store';
import { loadOnCallSlots } from './store';

export type SexPreference = StaffSex | 'either';

export type OnCallModality = 'remote' | 'inPerson' | 'both';

export type MatchCandidate = {
  slot: OnCallSlot;
  user: StaffUser;
  sex?: StaffSex;
  displayName: string;
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
      displayName: displayNameFor(u)
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

function sortNextInLine(a: MatchCandidate, b: MatchCandidate): number {
  const startDiff = new Date(a.slot.startAt).getTime() - new Date(b.slot.startAt).getTime();
  if (startDiff !== 0) return startDiff;
  const createdDiff = new Date(a.slot.createdAt).getTime() - new Date(b.slot.createdAt).getTime();
  if (createdDiff !== 0) return createdDiff;
  return a.user.username.localeCompare(b.user.username);
}

export async function pickNextOnCallPeer(
  env: Env,
  sexPreference: SexPreference
): Promise<
  | { ok: true; chosen: MatchCandidate; freeCount: number; onCallCount: number }
  | { ok: false; error: string; freeCount: number; onCallCount: number }
> {
  const slots = onCallActiveAt(await loadOnCallSlots(env));
  const users = await loadUsers(env);
  const free = freeOnCallCandidates(slots, users);
  const onCallCount = new Set(slots.filter(slotSupportsRemote).map(s => s.username.toLowerCase())).size;
  const matches = free.filter(c => (sexPreference === 'either' ? true : c.sex === sexPreference));

  if (matches.length === 0) {
    let error: string;
    if (onCallCount > 0 && free.length === 0) {
      error =
        'Peers are on call but all are currently marked Unavailable. Try again shortly, or use Request Help for follow-up.';
    } else if (sexPreference === 'male') {
      error = 'No male peer is free on call right now. Try Female or Either, or submit a follow-up request.';
    } else if (sexPreference === 'female') {
      error = 'No female peer is free on call right now. Try Male or Either, or submit a follow-up request.';
    } else {
      error = 'No peer is free on call right now. Try again shortly, or submit a follow-up request.';
    }
    return { ok: false, error, freeCount: free.length, onCallCount };
  }

  matches.sort(sortNextInLine);
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
} {
  let male = 0;
  let female = 0;
  for (const c of freeRemote) {
    if (c.sex === 'male') male += 1;
    else if (c.sex === 'female') female += 1;
  }
  return {
    maleAvailable: male,
    femaleAvailable: female,
    eitherAvailable: freeRemote.length,
    faceToFaceAvailable: freeInPerson.length
  };
}
