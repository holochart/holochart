import { LinePrimitive, type DataTransform } from '@mk7s/holochart-render';
import { gaussian, rng } from '../_lib/rng.ts';
import { createDevStage } from '../_lib/stage.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Line primitive at series scale (plan E2.5): three 10k-point seeded random walks with NaN gaps in
 * ONE primitive (one draw call, polylines split by `starts`), the same data with `connectGaps`,
 * and a colorscale-colored line (per-vertex colors). x values are millisecond timestamps to
 * exercise the relative-to-center encoding.
 */
export const meta: ExampleMeta = {
  title: 'Lines: 10k-point series',
  description:
    'Seeded random walks with gaps (broken vs connectGaps), multi-polyline batching, colorscale line.',
  tags: ['dev', 'primitives', 'lines'],
  size: { width: 800, height: 500 },
};

const N = 10_000;
const T0 = Date.UTC(2024, 0, 1);
const STEP_MS = 60_000;

/** Linear data → px transform mapping [d0, d1] onto [r0, r1] per axis. */
function linear(
  [dx0, dx1]: [number, number],
  [rx0, rx1]: [number, number],
  [dy0, dy1]: [number, number],
  [ry0, ry1]: [number, number],
): DataTransform {
  const scaleX = (rx1 - rx0) / (dx1 - dx0);
  const scaleY = (ry1 - ry0) / (dy1 - dy0);
  return { scaleX, scaleY, offsetX: rx0 - dx0 * scaleX, offsetY: ry0 - dy0 * scaleY };
}

/** A small viridis-like ramp (sRGB). */
const RAMP: [number, number, number][] = [
  [0.267, 0.005, 0.329],
  [0.231, 0.322, 0.545],
  [0.129, 0.569, 0.549],
  [0.369, 0.788, 0.384],
  [0.993, 0.906, 0.144],
];
function ramp(t: number, out: Float32Array, o: number): void {
  const s = Math.min(0.9999, Math.max(0, t)) * (RAMP.length - 1);
  const i = Math.floor(s);
  const f = s - i;
  const a = RAMP[i]!;
  const b = RAMP[i + 1]!;
  for (let c = 0; c < 3; c++) out[o + c] = a[c]! + (b[c]! - a[c]!) * f;
  out[o + 3] = 1;
}

function walk(seed: number, gaps: boolean): Float64Array {
  const random = rng(seed);
  const normal = gaussian(random);
  const y = new Float64Array(N);
  let v = 0;
  let gapLeft = 0;
  for (let i = 0; i < N; i++) {
    v += normal();
    y[i] = v;
    if (gaps) {
      if (gapLeft === 0 && random() < 0.0015) gapLeft = 20 + Math.floor(random() * 200);
      if (gapLeft > 0) {
        y[i] = NaN;
        gapLeft--;
      }
    }
  }
  return y;
}

export function run(el: HTMLElement): ExampleHandle {
  const stage = createDevStage(el, { background: '#ffffff' });
  const { width, height } = stage.size;
  const xDomain: [number, number] = [T0, T0 + (N - 1) * STEP_MS];
  const xRange: [number, number] = [20, width - 20];

  const time = new Float64Array(N);
  for (let i = 0; i < N; i++) time[i] = T0 + i * STEP_MS;

  // Three gappy walks in one primitive: concatenate and mark polyline starts.
  const walks = [walk(1, true), walk(2, true), walk(3, true)];
  const x = new Float64Array(3 * N);
  const y = new Float64Array(3 * N);
  const colors = new Float32Array(3 * N * 4);
  const palette = [
    [0.12, 0.47, 0.71, 1],
    [1.0, 0.5, 0.05, 1],
    [0.17, 0.63, 0.17, 1],
  ];
  walks.forEach((w, k) => {
    x.set(time, k * N);
    // Offset each walk so they don't overlap.
    for (let i = 0; i < N; i++) {
      y[k * N + i] = w[i]! + k * 60;
      colors.set(palette[k]!, (k * N + i) * 4);
    }
  });
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const v of y) {
    if (!Number.isFinite(v)) continue;
    yMin = Math.min(yMin, v);
    yMax = Math.max(yMax, v);
  }

  const broken = new LinePrimitive(stage.context, {
    x,
    y,
    starts: [N, 2 * N],
    color: colors,
    width: 1.5,
    join: 'round',
  });
  broken.setTransform(linear(xDomain, xRange, [yMin, yMax], [height * 0.55, height - 10]));
  stage.add(broken);

  const connected = new LinePrimitive(stage.context, {
    x,
    y,
    starts: [N, 2 * N],
    color: colors,
    width: 1.5,
    join: 'round',
    connectGaps: true,
    dash: 'dot',
  });
  connected.setTransform(
    linear(xDomain, xRange, [yMin, yMax], [height * 0.3 + 5, height * 0.55 - 5]),
  );
  stage.add(connected);

  // Colorscale line: color by value.
  const cy = walk(7, false);
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of cy) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const rampColors = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) ramp((cy[i]! - lo) / (hi - lo), rampColors, i * 4);
  const scaled = new LinePrimitive(stage.context, {
    x: time,
    y: cy,
    color: rampColors,
    width: 3,
    join: 'round',
    cap: 'round',
  });
  scaled.setTransform(linear(xDomain, xRange, [lo, hi], [10, height * 0.3 - 10]));
  stage.add(scaled);

  stage.render();
  return { renderer: stage.renderer, ready: Promise.resolve(), dispose: () => stage.dispose() };
}
