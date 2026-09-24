/** Shared SVG path helpers for original coloring pages (viewBox 0 0 1000 1000). */

export const PAGE_SIZE = 1000;
export const CX = 500;
export const CY = 500;

export function rnd(n: number): number {
  return Math.round(n * 100) / 100;
}

export function polar(cx: number, cy: number, radius: number, angle: number): [number, number] {
  return [rnd(cx + radius * Math.cos(angle)), rnd(cy + radius * Math.sin(angle))];
}

export function circlePath(cx: number, cy: number, radius: number): string {
  const rad = rnd(radius);
  return `M ${rnd(cx - rad)} ${rnd(cy)} a ${rad} ${rad} 0 1 0 ${rnd(rad * 2)} 0 a ${rad} ${rad} 0 1 0 ${rnd(-rad * 2)} 0 Z`;
}

/** Annular wedge between r0 (inner) and r1 (outer) from a0 to a1 (radians). */
export function ringSegment(
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  a0: number,
  a1: number
): string {
  const p0 = polar(cx, cy, r0, a0);
  const p1 = polar(cx, cy, r1, a0);
  const p2 = polar(cx, cy, r1, a1);
  const p3 = polar(cx, cy, r0, a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return [
    `M ${p0[0]} ${p0[1]}`,
    `L ${p1[0]} ${p1[1]}`,
    `A ${rnd(r1)} ${rnd(r1)} 0 ${large} 1 ${p2[0]} ${p2[1]}`,
    `L ${p3[0]} ${p3[1]}`,
    `A ${rnd(r0)} ${rnd(r0)} 0 ${large} 0 ${p0[0]} ${p0[1]}`,
    'Z'
  ].join(' ');
}

export function polygon(points: Array<[number, number]>): string {
  return `M ${points.map(([x, y]) => `${rnd(x)} ${rnd(y)}`).join(' L ')} Z`;
}

export function rectPath(x: number, y: number, w: number, h: number): string {
  return polygon([
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h]
  ]);
}

export function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M ${rnd(cx - rx)} ${rnd(cy)} a ${rnd(rx)} ${rnd(ry)} 0 1 0 ${rnd(rx * 2)} 0 a ${rnd(rx)} ${rnd(ry)} 0 1 0 ${rnd(-rx * 2)} 0 Z`;
}

export function diamond(cx: number, cy: number, rx: number, ry: number): string {
  return polygon([
    [cx, cy - ry],
    [cx + rx, cy],
    [cx, cy + ry],
    [cx - rx, cy]
  ]);
}

export function star4(cx: number, cy: number, outer: number, inner: number): string {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return polygon(pts);
}

export function hexagon(cx: number, cy: number, size: number): string {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push([cx + size * Math.cos(a), cy + size * Math.sin(a)]);
  }
  return polygon(pts);
}

export function petal(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  a0: number,
  a1: number
): string {
  const mid = (a0 + a1) / 2;
  const innerL = polar(cx, cy, innerR, a0);
  const innerRPt = polar(cx, cy, innerR, a1);
  const tip = polar(cx, cy, outerR, mid);
  const ctrlL = polar(cx, cy, innerR + (outerR - innerR) * 0.72, a0 + (a1 - a0) * 0.22);
  const ctrlR = polar(cx, cy, innerR + (outerR - innerR) * 0.72, a1 - (a1 - a0) * 0.22);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return [
    `M ${innerL[0]} ${innerL[1]}`,
    `Q ${ctrlL[0]} ${ctrlL[1]} ${tip[0]} ${tip[1]}`,
    `Q ${ctrlR[0]} ${ctrlR[1]} ${innerRPt[0]} ${innerRPt[1]}`,
    `A ${rnd(innerR)} ${rnd(innerR)} 0 ${large} 0 ${innerL[0]} ${innerL[1]}`,
    'Z'
  ].join(' ');
}

export function leaf(
  baseX: number,
  baseY: number,
  length: number,
  width: number,
  angle: number
): string {
  const tip = polar(baseX, baseY, length, angle);
  const left = polar(baseX, baseY, length * 0.48, angle + 0.55);
  const right = polar(baseX, baseY, length * 0.48, angle - 0.55);
  const leftW = polar(left[0], left[1], width * 0.35, angle + Math.PI / 2);
  const rightW = polar(right[0], right[1], width * 0.35, angle - Math.PI / 2);
  return [
    `M ${rnd(baseX)} ${rnd(baseY)}`,
    `Q ${leftW[0]} ${leftW[1]} ${tip[0]} ${tip[1]}`,
    `Q ${rightW[0]} ${rightW[1]} ${rnd(baseX)} ${rnd(baseY)}`,
    'Z'
  ].join(' ');
}
