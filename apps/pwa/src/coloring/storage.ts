const PREFIX = 'peerpoint.coloring.v1.';
const PAINT_PREFIX = 'peerpoint.coloring.paint.v1.';

export type ColoringFills = Record<string, string>;

export function loadColoringFills(pageId: string): ColoringFills {
  try {
    const raw = localStorage.getItem(PREFIX + pageId);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as ColoringFills;
  } catch {
    return {};
  }
}

export function saveColoringFills(pageId: string, fills: ColoringFills): void {
  try {
    const colored = Object.entries(fills).filter(([, hex]) => hex && hex !== '#ffffff' && hex !== '#fff');
    if (colored.length === 0) {
      localStorage.removeItem(PREFIX + pageId);
      return;
    }
    localStorage.setItem(PREFIX + pageId, JSON.stringify(fills));
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadColoringPaint(pageId: string): string | null {
  try {
    return localStorage.getItem(PAINT_PREFIX + pageId);
  } catch {
    return null;
  }
}

export function saveColoringPaint(pageId: string, dataUrl: string | null): void {
  try {
    if (!dataUrl) {
      localStorage.removeItem(PAINT_PREFIX + pageId);
      return;
    }
    localStorage.setItem(PAINT_PREFIX + pageId, dataUrl);
  } catch {
    /* quota / private mode — keep coloring in memory */
  }
}

export function coloringHasProgress(pageId: string): boolean {
  if (Object.keys(loadColoringFills(pageId)).length > 0) return true;
  return Boolean(loadColoringPaint(pageId));
}

export function clearColoringFills(pageId: string): void {
  try {
    localStorage.removeItem(PREFIX + pageId);
    localStorage.removeItem(PAINT_PREFIX + pageId);
  } catch {
    /* ignore */
  }
}
