/** Client-side Admin host detection (mirrors Functions rule). */
export const ADMIN_HOST = 'admin.mypeerpoint.com';
export const MEMBER_ORIGIN = 'https://mypeerpoint.com';

export function isAdminHostClient(hostname = typeof window !== 'undefined' ? window.location.hostname : ''): boolean {
  const host = hostname.split(':')[0]!.trim().toLowerCase();
  if (host === ADMIN_HOST) return true;
  if (host === 'admin.localhost') return true;
  if (host === 'localhost' || host === '127.0.0.1') return true;
  return false;
}

export function isProductionAdminHost(
  hostname = typeof window !== 'undefined' ? window.location.hostname : ''
): boolean {
  return hostname.split(':')[0]!.trim().toLowerCase() === ADMIN_HOST;
}
