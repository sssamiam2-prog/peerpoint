import {
  CX,
  CY,
  PAGE_SIZE,
  circlePath,
  diamond,
  ellipsePath,
  hexagon,
  leaf,
  petal,
  polar,
  polygon,
  rectPath,
  ringSegment,
  rnd,
  star4
} from './geometry';
import type { ColoringPage, ColoringRegion } from './types';

function ids(pageId: string, regions: string[]): ColoringRegion[] {
  return regions.map((d, i) => ({ id: `${pageId}-${i}`, d }));
}

function radiantMandala(): ColoringPage {
  const id = 'radiant-mandala';
  const ds: string[] = [circlePath(CX, CY, 42)];
  const rings: Array<{ r0: number; r1: number; n: number; kind: 'seg' | 'petal' }> = [
    { r0: 42, r1: 95, n: 8, kind: 'seg' },
    { r0: 95, r1: 155, n: 12, kind: 'petal' },
    { r0: 155, r1: 175, n: 24, kind: 'seg' },
    { r0: 175, r1: 255, n: 16, kind: 'petal' },
    { r0: 255, r1: 280, n: 32, kind: 'seg' },
    { r0: 280, r1: 365, n: 20, kind: 'petal' },
    { r0: 365, r1: 395, n: 36, kind: 'seg' },
    { r0: 395, r1: 470, n: 24, kind: 'petal' }
  ];
  for (const ring of rings) {
    const step = (Math.PI * 2) / ring.n;
    const offset = ring.kind === 'petal' ? step / 2 : 0;
    for (let i = 0; i < ring.n; i += 1) {
      const a0 = i * step + offset;
      const a1 = a0 + step;
      ds.push(
        ring.kind === 'petal'
          ? petal(CX, CY, ring.r0, ring.r1, a0, a1)
          : ringSegment(CX, CY, ring.r0, ring.r1, a0, a1)
      );
    }
  }
  return {
    id,
    title: 'Radiant mandala',
    description: 'Concentric rings and petals. A classic structured page for settling the mind.',
    category: 'mandala',
    why: 'Repeating circular patterns support focused attention and a flow state.',
    viewBox: `0 0 ${PAGE_SIZE} ${PAGE_SIZE}`,
    strokeWidth: 2.2,
    regions: ids(id, ds)
  };
}

function lotusBloom(): ColoringPage {
  const id = 'lotus-bloom';
  const ds: string[] = [circlePath(CX, CY, 36)];
  const layers = [
    { r0: 36, r1: 125, n: 8, offset: 0 },
    { r0: 125, r1: 215, n: 10, offset: Math.PI / 10 },
    { r0: 215, r1: 310, n: 12, offset: 0 },
    { r0: 310, r1: 400, n: 14, offset: Math.PI / 14 },
    { r0: 400, r1: 455, n: 16, offset: 0 }
  ];
  for (const layer of layers) {
    const step = (Math.PI * 2) / layer.n;
    for (let i = 0; i < layer.n; i += 1) {
      const a0 = i * step + layer.offset;
      ds.push(petal(CX, CY, layer.r0, layer.r1, a0, a0 + step));
    }
  }
  const outer = 36;
  const step = (Math.PI * 2) / outer;
  for (let i = 0; i < outer; i += 1) {
    ds.push(ringSegment(CX, CY, 455, 488, i * step, (i + 1) * step));
  }
  return {
    id,
    title: 'Lotus bloom',
    description: 'Layered petals opening from the center. Slow, rhythmic coloring.',
    category: 'mandala',
    why: 'Soft organic shapes invite slower breathing and less “stay in the lines” pressure.',
    viewBox: `0 0 ${PAGE_SIZE} ${PAGE_SIZE}`,
    strokeWidth: 2,
    regions: ids(id, ds)
  };
}

function stainedGlass(): ColoringPage {
  const id = 'stained-glass';
  const ds: string[] = [circlePath(CX, CY, 480)];
  const rings = [90, 170, 260, 350, 440, 480];
  let prev = 0;
  const counts = [8, 12, 16, 20, 24, 28];
  for (let r = 0; r < rings.length; r += 1) {
    const n = counts[r] ?? 16;
    const step = (Math.PI * 2) / n;
    const offset = r % 2 === 1 ? step / 2 : 0;
    for (let i = 0; i < n; i += 1) {
      ds.push(ringSegment(CX, CY, prev, rings[r]!, i * step + offset, (i + 1) * step + offset));
    }
    prev = rings[r]!;
  }
  return {
    id,
    title: 'Stained glass',
    description: 'Faceted rings like a window. Medium detail without tiny corners.',
    category: 'geometric',
    why: 'Bounded geometric sections make it easy to pick a color and stay with one area.',
    viewBox: `0 0 ${PAGE_SIZE} ${PAGE_SIZE}`,
    strokeWidth: 2.4,
    regions: ids(id, ds)
  };
}

function mountainHorizon(): ColoringPage {
  const id = 'mountain-horizon';
  const ds: string[] = [];
  ds.push(polygon([[0, 0], [1000, 0], [1000, 160], [0, 160]]));
  ds.push(polygon([[0, 160], [1000, 160], [1000, 300], [0, 300]]));
  ds.push(polygon([[0, 300], [1000, 300], [1000, 420], [0, 420]]));
  ds.push(circlePath(780, 210, 70));
  const sunRays = 12;
  for (let i = 0; i < sunRays; i += 1) {
    const a0 = (i / sunRays) * Math.PI * 2;
    const a1 = a0 + Math.PI / sunRays / 1.6;
    const inner = polar(780, 210, 78, a0);
    const outer = polar(780, 210, 118, (a0 + a1) / 2);
    const inner2 = polar(780, 210, 78, a1);
    ds.push(polygon([inner, outer, inner2]));
  }
  ds.push(polygon([[0, 420], [180, 250], [340, 400], [520, 180], [700, 390], [860, 230], [1000, 410], [1000, 520], [0, 520]]));
  ds.push(polygon([[0, 500], [140, 360], [300, 510], [470, 320], [640, 500], [800, 350], [1000, 505], [1000, 640], [0, 640]]));
  ds.push(polygon([[0, 620], [220, 470], [400, 630], [580, 490], [760, 640], [920, 520], [1000, 630], [1000, 780], [0, 780]]));
  ds.push(polygon([[0, 760], [1000, 760], [1000, 1000], [0, 1000]]));
  ds.push(polygon([[0, 860], [80, 820], [170, 900], [260, 800], [360, 920], [470, 790], [580, 930], [690, 800], [800, 910], [900, 810], [1000, 880], [1000, 1000], [0, 1000]]));
  const trees: Array<[number, number, number]> = [
    [90, 780, 90],
    [160, 800, 70],
    [840, 770, 100],
    [910, 795, 75]
  ];
  for (const [x, y, h] of trees) {
    ds.push(polygon([[x, y], [x + 18, y], [x + 18, y + 40], [x, y + 40]]));
    ds.push(polygon([[x + 9, y - h], [x + 9 + h * 0.42, y + 8], [x + 9 - h * 0.42, y + 8]]));
    ds.push(polygon([[x + 9, y - h * 0.62], [x + 9 + h * 0.34, y + 22], [x + 9 - h * 0.34, y + 22]]));
  }
  return {
    id,
    title: 'Mountain horizon',
    description: 'Sky bands, sun, and layered peaks. Larger shapes for a slower session.',
    category: 'nature',
    why: 'Open landscape shapes are grounding and less fussy than dense ornament.',
    viewBox: `0 0 ${PAGE_SIZE} ${PAGE_SIZE}`,
    strokeWidth: 2.4,
    regions: ids(id, ds)
  };
}

function oceanCalm(): ColoringPage {
  const id = 'ocean-calm';
  const ds: string[] = [];
  ds.push(polygon([[0, 0], [1000, 0], [1000, 220], [0, 280]]));
  ds.push(polygon([[0, 250], [1000, 190], [1000, 340], [0, 400]]));
  ds.push(circlePath(200, 160, 64));
  const wave = (y: number, amp: number, cycles: number, nextY: number): string => {
    const pts: string[] = [`M 0 ${rnd(y)}`];
    const steps = 24;
    for (let i = 0; i <= steps; i += 1) {
      const x = (i / steps) * 1000;
      const yy = y + Math.sin((i / steps) * Math.PI * 2 * cycles) * amp;
      pts.push(`L ${rnd(x)} ${rnd(yy)}`);
    }
    pts.push(`L 1000 ${rnd(nextY)} L 0 ${rnd(nextY)} Z`);
    return pts.join(' ');
  };
  const bands = [
    [360, 18, 2, 470],
    [450, 22, 2.5, 560],
    [540, 20, 3, 650],
    [630, 24, 2.2, 740],
    [720, 18, 3.2, 830],
    [810, 16, 2.8, 910],
    [900, 14, 2, 1000]
  ] as const;
  for (const [y, amp, cycles, nextY] of bands) {
    ds.push(wave(y, amp, cycles, nextY));
  }
  for (const [x, y, rad] of [
    [120, 880, 28],
    [210, 930, 18],
    [780, 860, 32],
    [870, 920, 20],
    [500, 960, 16]
  ] as Array<[number, number, number]>) {
    ds.push(circlePath(x, y, rad));
  }
  return {
    id,
    title: 'Ocean calm',
    description: 'Stacked waves and a low sun. Follow the water line by line.',
    category: 'nature',
    why: 'Horizontal repetition is rhythmic — similar to a breathing cadence.',
    viewBox: `0 0 ${PAGE_SIZE} ${PAGE_SIZE}`,
    strokeWidth: 2.3,
    regions: ids(id, ds)
  };
}

function leafWreath(): ColoringPage {
  const id = 'leaf-wreath';
  const ds: string[] = [circlePath(CX, CY, 70)];
  const innerPetals = 10;
  const innerStep = (Math.PI * 2) / innerPetals;
  for (let i = 0; i < innerPetals; i += 1) {
    ds.push(petal(CX, CY, 70, 150, i * innerStep, (i + 1) * innerStep));
  }
  const rings = [
    { radius: 210, n: 14, length: 95, width: 38 },
    { radius: 300, n: 16, length: 110, width: 42 },
    { radius: 395, n: 18, length: 100, width: 36 }
  ];
  for (const ring of rings) {
    const step = (Math.PI * 2) / ring.n;
    for (let i = 0; i < ring.n; i += 1) {
      const a = i * step + (ring.n % 4 === 0 ? step / 2 : 0);
      const base = polar(CX, CY, ring.radius - 20, a);
      ds.push(leaf(base[0], base[1], ring.length, ring.width, a));
    }
  }
  const berries = 18;
  const berryStep = (Math.PI * 2) / berries;
  for (let i = 0; i < berries; i += 1) {
    const p = polar(CX, CY, 455, i * berryStep);
    ds.push(circlePath(p[0], p[1], 16));
  }
  const outer = 24;
  const oStep = (Math.PI * 2) / outer;
  for (let i = 0; i < outer; i += 1) {
    ds.push(ringSegment(CX, CY, 478, 498, i * oStep, (i + 1) * oStep));
  }
  return {
    id,
    title: 'Leaf wreath',
    description: 'Botanical ring of leaves around a small blossom.',
    category: 'nature',
    why: 'Nature motifs are a common adult-coloring staple and pair well with greens and earth tones.',
    viewBox: `0 0 ${PAGE_SIZE} ${PAGE_SIZE}`,
    strokeWidth: 2.1,
    regions: ids(id, ds)
  };
}

function hexCalm(): ColoringPage {
  const id = 'hex-calm';
  const ds: string[] = [circlePath(CX, CY, 488)];
  const size = 42;
  const w = size * Math.sqrt(3);
  const h = size * 1.5;
  const cols = 13;
  const rows = 15;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = CX - (cols * w) / 2 + col * w + (row % 2 === 1 ? w / 2 : 0);
      const y = CY - (rows * h) / 2 + row * h + 30;
      const dx = x - CX;
      const dy = y - CY;
      if (Math.sqrt(dx * dx + dy * dy) > 430) continue;
      ds.push(hexagon(x, y, size - 1.5));
    }
  }
  return {
    id,
    title: 'Honeycomb calm',
    description: 'A hexagonal field. Tap any cell — no starting point required.',
    category: 'geometric',
    why: 'Uniform cells support “just pick one and continue,” which helps with flow.',
    viewBox: `0 0 ${PAGE_SIZE} ${PAGE_SIZE}`,
    strokeWidth: 2,
    regions: ids(id, ds)
  };
}

function compassStar(): ColoringPage {
  const id = 'compass-star';
  const ds: string[] = [circlePath(CX, CY, 48)];
  const wedges = 16;
  const wStep = (Math.PI * 2) / wedges;
  for (let i = 0; i < wedges; i += 1) {
    ds.push(ringSegment(CX, CY, 48, 140, i * wStep, (i + 1) * wStep));
  }
  const points = 8;
  for (let i = 0; i < points; i += 1) {
    const a = (i / points) * Math.PI * 2 - Math.PI / 2;
    const aL = a - Math.PI / points;
    const aR = a + Math.PI / points;
    const tip = polar(CX, CY, 310, a);
    const left = polar(CX, CY, 140, aL);
    const right = polar(CX, CY, 140, aR);
    const inner = polar(CX, CY, 175, a);
    ds.push(polygon([left, tip, inner]));
    ds.push(polygon([right, tip, inner]));
  }
  const rings = [
    [318, 355, 24],
    [355, 400, 32],
    [400, 448, 36],
    [448, 488, 40]
  ] as const;
  for (const [r0, r1, n] of rings) {
    const step = (Math.PI * 2) / n;
    for (let i = 0; i < n; i += 1) {
      ds.push(ringSegment(CX, CY, r0, r1, i * step, (i + 1) * step));
    }
  }
  return {
    id,
    title: 'Compass star',
    description: 'A grounding star and outer rings. Useful when you want a clear center.',
    category: 'geometric',
    why: 'A strong center-and-radiate layout helps attention return when the mind wanders.',
    viewBox: `0 0 ${PAGE_SIZE} ${PAGE_SIZE}`,
    strokeWidth: 2.2,
    regions: ids(id, ds)
  };
}

function plaidCalm(): ColoringPage {
  const id = 'plaid-calm';
  const ds: string[] = [rectPath(40, 40, 920, 920)];
  const n = 10;
  const pad = 70;
  const cell = (1000 - pad * 2) / n;
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      ds.push(rectPath(pad + col * cell, pad + row * cell, cell, cell));
    }
  }
  return {
    id,
    title: 'Plaid calm',
    description: 'A simple grid, like the “plaid” pages used in early anxiety studies.',
    category: 'geometric',
    why: 'Structured geometric coloring reduced anxiety about as much as mandalas in Curry & Kasser (2005).',
    viewBox: `0 0 ${PAGE_SIZE} ${PAGE_SIZE}`,
    strokeWidth: 2.4,
    regions: ids(id, ds)
  };
}

function diamondQuilt(): ColoringPage {
  const id = 'diamond-quilt';
  const ds: string[] = [rectPath(0, 0, 1000, 1000)];
  const rx = 48;
  const ry = 62;
  let row = 0;
  for (let y = 70; y <= 930; y += ry) {
    const offset = row % 2 === 0 ? 0 : rx;
    for (let x = 70 + offset; x <= 930; x += rx * 2) {
      ds.push(diamond(x, y, rx - 2, ry - 2));
    }
    row += 1;
  }
  return {
    id,
    title: 'Diamond quilt',
    description: 'Repeating diamonds. Pick any cell and keep going — no starting point required.',
    category: 'geometric',
    why: 'Repeating bounded shapes support flow: one small, clear next action.',
    viewBox: `0 0 ${PAGE_SIZE} ${PAGE_SIZE}`,
    strokeWidth: 2.1,
    regions: ids(id, ds)
  };
}

function starMandala(): ColoringPage {
  const id = 'star-mandala';
  const ds: string[] = [circlePath(CX, CY, 40), star4(CX, CY, 95, 38)];
  const rings = [
    { r0: 100, r1: 170, n: 10 },
    { r0: 170, r1: 250, n: 12 },
    { r0: 250, r1: 340, n: 16 },
    { r0: 340, r1: 420, n: 20 },
    { r0: 420, r1: 488, n: 24 }
  ];
  for (const ring of rings) {
    const step = (Math.PI * 2) / ring.n;
    for (let i = 0; i < ring.n; i += 1) {
      ds.push(petal(CX, CY, ring.r0, ring.r1, i * step, (i + 1) * step));
    }
  }
  return {
    id,
    title: 'Star mandala',
    description: 'A second circular mandala with a star center and petal rings.',
    category: 'mandala',
    why: 'Circular, reasonably complex patterns are the most studied design for short-term anxiety relief.',
    viewBox: `0 0 ${PAGE_SIZE} ${PAGE_SIZE}`,
    strokeWidth: 2.1,
    regions: ids(id, ds)
  };
}

function sunflower(): ColoringPage {
  const id = 'sunflower';
  const ds: string[] = [circlePath(CX, CY, 48)];
  const seeds = 16;
  const seedStep = (Math.PI * 2) / seeds;
  for (let i = 0; i < seeds; i += 1) {
    const p = polar(CX, CY, 78, i * seedStep);
    ds.push(circlePath(p[0], p[1], 16));
  }
  const seed2 = 22;
  const seed2Step = (Math.PI * 2) / seed2;
  for (let i = 0; i < seed2; i += 1) {
    const p = polar(CX, CY, 118, i * seed2Step + seed2Step / 2);
    ds.push(circlePath(p[0], p[1], 14));
  }
  const petals = 18;
  const pStep = (Math.PI * 2) / petals;
  for (let i = 0; i < petals; i += 1) {
    ds.push(petal(CX, CY, 140, 280, i * pStep, (i + 1) * pStep));
  }
  for (let i = 0; i < petals; i += 1) {
    ds.push(petal(CX, CY, 270, 410, i * pStep + pStep / 2, (i + 1) * pStep + pStep / 2));
  }
  const leaves = 8;
  const lStep = (Math.PI * 2) / leaves;
  for (let i = 0; i < leaves; i += 1) {
    const base = polar(CX, CY, 420, i * lStep);
    ds.push(leaf(base[0], base[1], 78, 36, i * lStep));
  }
  const rim = 28;
  const rStep = (Math.PI * 2) / rim;
  for (let i = 0; i < rim; i += 1) {
    ds.push(ringSegment(CX, CY, 470, 498, i * rStep, (i + 1) * rStep));
  }
  return {
    id,
    title: 'Sunflower',
    description: 'Seeds, petals, and leaves. A nature mandala you can color slowly.',
    category: 'nature',
    why: 'Organic repetition with a clear center — structured enough for focus, softer than a geometric grid.',
    viewBox: `0 0 ${PAGE_SIZE} ${PAGE_SIZE}`,
    strokeWidth: 2,
    regions: ids(id, ds)
  };
}

function wildflowerField(): ColoringPage {
  const id = 'wildflower-field';
  const ds: string[] = [
    rectPath(0, 0, 1000, 280),
    rectPath(0, 260, 1000, 280),
    rectPath(0, 520, 1000, 250),
    rectPath(0, 750, 1000, 250)
  ];
  const flowers: Array<[number, number, number, number]> = [
    [170, 200, 52, 8],
    [420, 160, 64, 10],
    [680, 210, 48, 8],
    [860, 150, 56, 9],
    [140, 430, 60, 9],
    [330, 390, 46, 8],
    [540, 450, 70, 12],
    [760, 400, 52, 8],
    [900, 460, 44, 7],
    [220, 680, 58, 10],
    [470, 640, 50, 8],
    [700, 700, 66, 11],
    [880, 650, 48, 8],
    [160, 860, 42, 7],
    [390, 840, 54, 9],
    [610, 880, 46, 8],
    [820, 850, 60, 10]
  ];
  for (const [x, y, r, n] of flowers) {
    ds.push(circlePath(x, y, r * 0.28));
    const step = (Math.PI * 2) / n;
    for (let i = 0; i < n; i += 1) {
      ds.push(petal(x, y, r * 0.26, r, i * step, (i + 1) * step));
    }
  }
  return {
    id,
    title: 'Wildflower field',
    description: 'Sky bands and scattered blossoms. Color one flower at a time.',
    category: 'nature',
    why: 'Nature pages offer larger, softer shapes when a dense mandala feels like too much.',
    viewBox: `0 0 ${PAGE_SIZE} ${PAGE_SIZE}`,
    strokeWidth: 2.1,
    regions: ids(id, ds)
  };
}

function forestStill(): ColoringPage {
  const id = 'forest-still';
  const ds: string[] = [
    rectPath(0, 0, 1000, 220),
    rectPath(0, 200, 1000, 180),
    circlePath(780, 170, 58)
  ];
  ds.push(polygon([[0, 360], [1000, 340], [1000, 520], [0, 540]]));
  ds.push(rectPath(0, 500, 1000, 500));
  const trees: Array<[number, number, number]> = [
    [90, 620, 160],
    [180, 680, 120],
    [280, 600, 190],
    [400, 650, 140],
    [520, 580, 210],
    [650, 640, 150],
    [760, 600, 180],
    [870, 670, 130],
    [940, 630, 155]
  ];
  for (const [x, y, h] of trees) {
    const trunkW = Math.max(14, h * 0.08);
    ds.push(rectPath(x - trunkW / 2, y, trunkW, h * 0.28));
    ds.push(polygon([[x, y - h * 0.55], [x + h * 0.28, y + 8], [x - h * 0.28, y + 8]]));
    ds.push(polygon([[x, y - h * 0.82], [x + h * 0.22, y - h * 0.28], [x - h * 0.22, y - h * 0.28]]));
    ds.push(polygon([[x, y - h], [x + h * 0.16, y - h * 0.52], [x - h * 0.16, y - h * 0.52]]));
  }
  ds.push(polygon([[0, 860], [120, 800], [240, 900], [380, 790], [520, 920], [660, 800], [800, 910], [920, 820], [1000, 880], [1000, 1000], [0, 1000]]));
  return {
    id,
    title: 'Forest still',
    description: 'Layered trees and a quiet sky. Larger shapes for a slower session.',
    category: 'nature',
    why: 'Open landscape shapes are grounding when you want less tiny detail.',
    viewBox: `0 0 ${PAGE_SIZE} ${PAGE_SIZE}`,
    strokeWidth: 2.3,
    regions: ids(id, ds)
  };
}

function nightSky(): ColoringPage {
  const id = 'night-sky';
  const ds: string[] = [
    rectPath(0, 0, 1000, 220),
    rectPath(0, 200, 1000, 220),
    rectPath(0, 400, 1000, 220),
    rectPath(0, 600, 1000, 220)
  ];
  ds.push(circlePath(250, 210, 72));
  ds.push(circlePath(230, 195, 18));
  ds.push(circlePath(270, 230, 12));
  const stars: Array<[number, number, number]> = [
    [120, 90, 22],
    [400, 70, 18],
    [560, 140, 26],
    [720, 80, 16],
    [860, 160, 24],
    [480, 280, 20],
    [640, 250, 14],
    [900, 300, 18],
    [80, 300, 16],
    [150, 430, 20],
    [330, 390, 14],
    [790, 360, 22],
    [940, 420, 16]
  ];
  for (const [x, y, s] of stars) {
    ds.push(star4(x, y, s, s * 0.38));
  }
  ds.push(polygon([[0, 700], [180, 560], [360, 690], [540, 520], [720, 680], [880, 540], [1000, 670], [1000, 820], [0, 820]]));
  ds.push(polygon([[0, 800], [1000, 800], [1000, 1000], [0, 1000]]));
  return {
    id,
    title: 'Night sky',
    description: 'Moon, stars, and a quiet ridge. Color the sky in bands or one star at a time.',
    category: 'nature',
    why: 'A mix of large sky fields and small stars lets you choose easy or detailed work.',
    viewBox: `0 0 ${PAGE_SIZE} ${PAGE_SIZE}`,
    strokeWidth: 2.2,
    regions: ids(id, ds)
  };
}

function riverStones(): ColoringPage {
  const id = 'river-stones';
  const ds: string[] = [rectPath(0, 0, 1000, 1000)];
  const stones: Array<[number, number, number, number]> = [
    [180, 160, 110, 70],
    [400, 140, 90, 60],
    [640, 180, 120, 72],
    [860, 150, 80, 55],
    [120, 340, 95, 62],
    [320, 320, 125, 78],
    [540, 360, 100, 64],
    [760, 330, 115, 70],
    [920, 360, 78, 50],
    [200, 540, 118, 74],
    [430, 520, 92, 58],
    [650, 560, 130, 80],
    [870, 530, 88, 56],
    [140, 740, 100, 66],
    [360, 720, 140, 82],
    [600, 760, 96, 60],
    [820, 730, 120, 74],
    [250, 900, 110, 68],
    [500, 910, 125, 70],
    [760, 890, 105, 64]
  ];
  for (const [x, y, rx, ry] of stones) {
    ds.push(ellipsePath(x, y, rx, ry));
  }
  return {
    id,
    title: 'River stones',
    description: 'Smooth overlapping ovals. Fill one stone, then the next.',
    category: 'nature',
    why: 'Simple repeating forms are easy to stay with — useful when the mind is tired.',
    viewBox: `0 0 ${PAGE_SIZE} ${PAGE_SIZE}`,
    strokeWidth: 2.3,
    regions: ids(id, ds)
  };
}

function labyrinthRing(): ColoringPage {
  const id = 'labyrinth-ring';
  const ds: string[] = [circlePath(CX, CY, 36)];
  const rings = [80, 130, 185, 245, 310, 375, 440, 488];
  let prev = 36;
  for (let r = 0; r < rings.length; r += 1) {
    const n = 8 + r * 2;
    const step = (Math.PI * 2) / n;
    const offset = r % 2 === 0 ? 0 : step / 2;
    for (let i = 0; i < n; i += 1) {
      ds.push(ringSegment(CX, CY, prev, rings[r]!, i * step + offset, (i + 1) * step + offset));
    }
    prev = rings[r]!;
  }
  return {
    id,
    title: 'Walking labyrinth',
    description: 'Circuit rings you can follow inward or outward, like a walking meditation on paper.',
    category: 'mandala',
    why: 'A path-like circular design keeps attention moving without needing a “finished” picture.',
    viewBox: `0 0 ${PAGE_SIZE} ${PAGE_SIZE}`,
    strokeWidth: 2.2,
    regions: ids(id, ds)
  };
}

function fanFeathers(): ColoringPage {
  const id = 'fan-feathers';
  const ds: string[] = [rectPath(0, 0, 1000, 1000), circlePath(CX, 920, 70)];
  const n = 14;
  for (let i = 0; i < n; i += 1) {
    const a0 = Math.PI + (i / n) * Math.PI;
    const a1 = Math.PI + ((i + 1) / n) * Math.PI;
    ds.push(petal(CX, 920, 80, 780, a0, a1));
  }
  const inner = 10;
  for (let i = 0; i < inner; i += 1) {
    const a0 = Math.PI + 0.2 + (i / inner) * (Math.PI - 0.4);
    const a1 = Math.PI + 0.2 + ((i + 1) / inner) * (Math.PI - 0.4);
    ds.push(petal(CX, 920, 80, 420, a0, a1));
  }
  return {
    id,
    title: 'Fan feathers',
    description: 'A rising fan of long sections. Color left to right, or work one plume at a time.',
    category: 'geometric',
    why: 'Large radial sections are easy on a phone and still give a repeating, meditative rhythm.',
    viewBox: `0 0 ${PAGE_SIZE} ${PAGE_SIZE}`,
    strokeWidth: 2.2,
    regions: ids(id, ds)
  };
}

export const COLORING_PAGES: ColoringPage[] = [
  radiantMandala(),
  lotusBloom(),
  starMandala(),
  labyrinthRing(),
  stainedGlass(),
  plaidCalm(),
  diamondQuilt(),
  hexCalm(),
  compassStar(),
  fanFeathers(),
  sunflower(),
  leafWreath(),
  wildflowerField(),
  forestStill(),
  mountainHorizon(),
  oceanCalm(),
  nightSky(),
  riverStones()
];

export function coloringPageById(id: string): ColoringPage | undefined {
  return COLORING_PAGES.find(p => p.id === id);
}

export const COLORING_CATEGORIES: Array<{ id: ColoringPage['category']; label: string }> = [
  { id: 'mandala', label: 'Mandalas' },
  { id: 'nature', label: 'Nature' },
  { id: 'geometric', label: 'Geometric' }
];
