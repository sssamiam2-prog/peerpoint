/**
 * Member site-use codes — server only (never ship these in the browser bundle).
 * Soft workplace deterrent, not strong authentication.
 */

const MEMBER_SITE_USE_CODES = new Set(['slcoso', 'soslco']);

export function normalizeSiteUseCode(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase();
}

export function isValidMemberAccessCode(raw: unknown): boolean {
  const code = normalizeSiteUseCode(raw);
  return code.length > 0 && MEMBER_SITE_USE_CODES.has(code);
}
