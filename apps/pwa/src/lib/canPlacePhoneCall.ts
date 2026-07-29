/** Whether this device is likely able to place a phone call via tel: links. */
export function canPlacePhoneCall(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';

  // Tablets should show the “call from a phone” modal, not dial.
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return false;
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return false;

  if (/iPhone|iPod|Windows Phone/i.test(ua)) return true;
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return true;

  // Coarse pointer + narrow viewport ≈ phone; fine pointer + wide ≈ desktop.
  try {
    if (window.matchMedia('(pointer: fine) and (min-width: 768px)').matches) return false;
    if (window.matchMedia('(hover: none) and (pointer: coarse) and (max-width: 640px)').matches) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
