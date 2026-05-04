const STORAGE_KEY = 'peerpoint-local-requests';
const MAX_ITEMS = 100;

export type LocalRequestRecord = {
  submittedAt: string;
  requesterName?: string;
  requesterPhone: string;
  requesterEmail: string;
  preferredContact?: string;
  description?: string;
  consentAcknowledged: boolean;
};

export function loadLocalRequests(): LocalRequestRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as LocalRequestRecord[]) : [];
  } catch {
    return [];
  }
}

export function appendLocalRequest(record: LocalRequestRecord): void {
  const next = [record, ...loadLocalRequests()].slice(0, MAX_ITEMS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function exportLocalRequestsJson(): string {
  return JSON.stringify(loadLocalRequests(), null, 2);
}
