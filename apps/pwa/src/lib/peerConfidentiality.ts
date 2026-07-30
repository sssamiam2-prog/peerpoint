/**
 * PEERPoint confidentiality notice — plain-language paraphrase of
 * Utah Code § 78B-5-903 and Utah Rule of Evidence 507.
 * Not legal advice; agency counsel should review official policy wording.
 */

const STORAGE_PREFIX = 'peerpoint_confidentiality_ack:';

export const PEER_CONFIDENTIALITY_EXCEPTIONS = [
  'Actual or suspected child abuse or neglect',
  'A clear and immediate danger to yourself or others',
  'Reasonable cause to believe you may be mentally or emotionally unfit for duty',
  'Evidence that you have committed a crime, plan to commit a crime, or intend to conceal a crime',
  'When the peer support team member was a witness or party to the incident that prompted the support'
] as const;

export function confidentialitySessionKey(kind: 'room' | 'request', id: string): string {
  return `${kind}:${id.trim().toLowerCase()}`;
}

export function hasAcknowledgedConfidentiality(sessionKey: string): boolean {
  if (!sessionKey.trim()) return false;
  try {
    return sessionStorage.getItem(`${STORAGE_PREFIX}${sessionKey}`) === '1';
  } catch {
    return false;
  }
}

export function acknowledgeConfidentiality(sessionKey: string): void {
  if (!sessionKey.trim()) return;
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${sessionKey}`, '1');
  } catch {
    /* ignore */
  }
}
