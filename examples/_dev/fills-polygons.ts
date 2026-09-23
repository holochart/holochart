import {
  createFillPrimitive,
  type DataTransform,
  type FillData,
  type RGBA,
} from '@mk7s/holochart-render';
import { createDevStage } from '../_lib/stage.ts';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Fill primitive demo (plan E2.6): polygons with holes (earcut fast path), self-intersecting
 * "toself" shapes under even-odd vs nonzero, and stacked-area bands with millisecond-timestamp x
 * values (RTC precision). Each panel is a single draw call.
 */
export const meta: ExampleMeta = {
  title: 'Fills & polygons',
  description:
    'Polygons with holes, even-odd vs nonzero self-intersecting fills, and stacked-area bands.',
  tags: ['dev', 'primitives', 'fill'],
  size: { width: 640, height: 400 },
};

const BLUE: RGBA = [0.23, 0.51, 0.96, 1];
const ORANGE: RGBA = [0.98, 0.45, 0.09, 1];
const GREEN: RGBA = [0.13, 0.7, 0.4, 1];
const PURPLE: RGBA = [0.55, 0.36, 0.96, 1];

/** Affine data rect → pixel rect transform. */
function fit(
  [dx0, dx1, dy0, dy1]: readonly [number, number, number, number],
  [px0, px1, py0, py1]: readonly [number, number, number, number],
): DataTransform {
  const scaleX = (px1 - px0) / (dx1 - dx0);
  const scaleY = (py1 - py0) / (dy1 - dy0);
  return { scaleX, scaleY, offsetX: px0 - dx0 * scaleX, offsetY: py0 - dy0 * scaleY };
}

/** Accumulates rings / polygons into the flat fill layout. */
function polygonBuilder(): {
  ring(points: readonly (readonly [number, number])[]): void;
  polygon(): void;
  data(): Pick<FillData, 'x' | 'y' | 'rings' | 'polygons'>;
} {
  const x: number[] = [];
  const y: number[] = [];
  const rings: number[] = [];
  const polygons: number[] = [];
  return {
    polygon: () => void polygons.push(rings.length),
    ring(points) {
      rings.push(x.length);
      for (const [px, py] of points) {
        x.push(px);
        y.push(py);
      }
    },
    data: () => ({ x: new Float64Array(x), y: new Float64Array(y), rings, polygons }),
  };
}

function circle(cx: number, cy: number, radius: number, n = 48): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    pts.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
  }
  return pts;
}

function pentagram(cx: number, cy: number, radius: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let k = 0; k < 5; k++) {
    const a = Math.PI / 2 + (4 * Math.PI * k) / 5;
    pts.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
  }
  return pts;
}

function colors(list: readonly RGBA[]): Float32Array {
  return new Float32Array(list.flat());
}

export function run(el: HTMLElement): ExampleHandle {
  const stage = createDevStage(el, { background: '#f8fafc' });
  const { width, height } = stage.size;
  const pad = 16;
  const midY = height * 0.5;

  // 1. Polygons with holes (default 'simple' rule): a plate with two holes and a donut.
  const holes = polygonBuilder();
  holes.polygon();
  holes.ring([
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ]);
  holes.ring([
    [2, 2],
    [5, 2],
    [5, 5],
    [2, 5],
  ]);
  holes.ring(circle(7, 7, 1.6, 32));
  holes.polygon();
  holes.ring(circle(17, 5, 5));
  holes.ring(circle(17, 5, 2.5));
  const holesFill = stage.add(
    createFillPrimitive(stage.context, { ...holes.data(), color: colors([BLUE, ORANGE]) }),
  );
  holesFill.setTransform(fit([0, 22, 0, 10], [pad, width * 0.42, midY + pad, height - pad]));

  // 2. Self-intersecting "toself" shapes: even-odd (hollow pentagram center) vs nonzero.
  const selfEvenOdd = polygonBuilder();
  selfEvenOdd.polygon();
  selfEvenOdd.ring(pentagram(0, 0, 1));
  selfEvenOdd.polygon();
  selfEvenOdd.ring([
    [1.3, -0.8],
    [2.9, 0.8],
    [2.9, -0.8],
    [1.3, 0.8],
  ]);
  const evenOdd = stage.add(
    createFillPrimitive(stage.context, {
      ...selfEvenOdd.data(),
      color: colors([GREEN, PURPLE]),
      fillRule: 'evenodd',
    }),
  );
  const nonzero = stage.add(
    createFillPrimitive(stage.context, {
      x: new Float64Array(pentagram(0, 0, 1).map(([px]) => px + 4.4)),
      y: new Float64Array(pentagram(0, 0, 1).map(([, py]) => py)),
      color: GREEN,
      fillRule: 'nonzero',
      opacity: 0.6,
    }),
  );
  const selfRect = fit(
    [-1.1, 5.5, -1.1, 1.1],
    [width * 0.47, width - pad, midY + pad, height - pad],
  );
  evenOdd.setTransform(selfRect);
  nonzero.setTransform(selfRect);

  // 3. Stacked-area bands: x in ms timestamps (RTC keeps float32 exact), three seeded series.
  const random = rng(7);
  const n = 60;
  const t0 = Date.UTC(2024, 0, 1);
  const day = 86_400_000;
  const t = Float64Array.from({ length: n }, (_, i) => t0 + i * day);
  const series = [0, 1, 2].map(() => {
    let v = 2 + random() * 2;
    return Array.from({ length: n }, () => (v = Math.max(0.3, v + (random() - 0.5) * 0.8)));
  });
  const bands = polygonBuilder();
  const lower = new Float64Array(n);
  for (const s of series) {
    const upper = lower.map((l, i) => l + s[i]!);
    const ring: [number, number][] = [];
    for (let i = 0; i < n; i++) ring.push([t[i]!, upper[i]!]);
    for (let i = n - 1; i >= 0; i--) ring.push([t[i]!, lower[i]!]);
    bands.polygon();
    bands.ring(ring);
    lower.set(upper);
  }
  const maxY = Math.max(...lower);
  const bandsFill = stage.add(
    createFillPrimitive(stage.context, {
      ...bands.data(),
      color: colors([BLUE, ORANGE, GREEN]),
      opacity: 0.85,
    }),
  );
  bandsFill.setTransform(
    fit([t0, t0 + (n - 1) * day, 0, maxY], [pad, width - pad, pad, midY - pad]),
  );

  stage.render();
  return {
    renderer: stage.renderer,
    ready: Promise.resolve(),
    dispose: () => stage.dispose(),
  };
}
