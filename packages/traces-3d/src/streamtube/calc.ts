/**
 * `streamtube` calc (plan E14.6), after plotly.js `streamtube/calc.js` + `convert.js` and
 * gl-streamtube3d: the grid of the field, the starts, the integrated streamlines, their vectors,
 * norms, divergences and tube radii, and the autorange.
 *
 * - **Coordinates**: positions in linear coordinates (dates and categories through the scene
 *   axes). The integration (`integrate.ts`) runs in Plotly's scaled coordinates: each axis and
 *   vector component divided by the field's span on that axis (`dataScale`; Plotly divides by the
 *   span of every trace in the scene, the same with one trace).
 * - **Grid** (`grid.ts`): the first `n` entries of `x`, `y`, `z`, `u`, `v`, `w` (`n` the shortest
 *   length); without a grid (over-specified or arbitrary points) the trace draws nothing, as in
 *   Plotly.
 * - **Norms**: `normMin` / `normMax` are the grid's (the colorscale's default `cmin` / `cmax`, as
 *   Plotly's colorscale calc); each sample's `norm` is its interpolated vector's.
 * - **Autorange**: the samples' extent padded by the largest tube radius (per axis, in data
 *   units); the field's extent without any sample.
 */
import { isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import type { CalcContext } from '@mk7s/holochart-runtime';
import { sceneExtent, sceneScales } from '../scene/axes.ts';
import type { SceneCalc } from '../scene/layout.ts';
import { sceneOf } from '../scene/layout-defaults.ts';
import { numbersOf } from '../mesh3d/colors.ts';
import { detectStreamGrid, type StreamGrid } from './grid.ts';
import {
  defaultStreamStarts,
  integrateStreams,
  minStartSeparation,
  streamBounds,
  streamTubeRadii,
  type StreamSet,
} from './integrate.ts';

type Vec3 = [number, number, number];

/** @experimental */
export interface StreamtubeCalc extends SceneCalc {
  /** The field's grid in scaled units (null: no grid, nothing drawn). */
  readonly grid: StreamGrid | null;
  /** Plotly's `gridFill` (`'+x+y+z'` …). */
  readonly fill: string;
  /** Scaled units per linear unit, per axis (`dataScale`). */
  readonly dataScale: Vec3;
  /** Streamlines in scaled units. */
  readonly streams: StreamSet;
  /** Number of samples (all tubes). */
  readonly count: number;
  /** Tube of each sample. */
  readonly tube: Uint32Array;
  /** Sample positions, linear coordinates. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
  /** The field's vector at each sample (data units). */
  readonly u: Float64Array;
  readonly v: Float64Array;
  readonly w: Float64Array;
  /** `|(u, v, w)|` per sample. */
  readonly norm: Float64Array;
  /** gl-streamtube3d's divergence per sample (scaled units). */
  readonly divergence: Float64Array;
  /** Tube radius per sample (scaled units). */
  readonly radius: Float64Array;
  readonly tubeScale: number;
  /** The grid's smallest / largest vector norm (0 / 0 without any). */
  readonly normMin: number;
  readonly normMax: number;
}

/** `[min, max]` of the norms of the first `n` vectors (`[0, 0]` without any finite one). */
export function normExtent(
  u: ArrayLike<number>,
  v: ArrayLike<number>,
  w: ArrayLike<number>,
  n: number,
): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const norm = Math.hypot(u[i]!, v[i]!, w[i]!);
    if (!Number.isFinite(norm)) continue;
    if (norm < lo) lo = norm;
    if (norm > hi) hi = norm;
  }
  return lo <= hi ? [lo, hi] : [0, 0];
}

const EMPTY_STREAMS: StreamSet = {
  offsets: new Uint32Array(1),
  position: new Float64Array(0),
  velocity: new Float64Array(0),
  divergence: new Float64Array(0),
  maxDivergence: 0,
  steps: 0,
};

/** The `streamtube` calc (see the module comment). */
export function calcStreamtube(trace: FullTrace, ctx: CalcContext): StreamtubeCalc {
  const s = sceneScales(ctx.fullLayout, sceneOf(trace));
  const col = (k: string): ArrayLike<unknown> =>
    isArrayLike(trace[k]) ? (trace[k] as ArrayLike<unknown>) : [];
  const len = Math.min(...['x', 'y', 'z', 'u', 'v', 'w'].map((k) => col(k).length));
  const lx = s.x.d2lArray(col('x')).subarray(0, len);
  const ly = s.y.d2lArray(col('y')).subarray(0, len);
  const lz = s.z.d2lArray(col('z')).subarray(0, len);
  const du = numbersOf(trace['u'], len);
  const dv = numbersOf(trace['v'], len);
  const dw = numbersOf(trace['w'], len);
  const extents = [sceneExtent(lx), sceneExtent(ly), sceneExtent(lz)];
  const dataScale = extents.map((e) => (e && e[1] > e[0] ? 1 / (e[1] - e[0]) : 1)) as Vec3;
  const [kx, ky, kz] = dataScale;
  const scaled = (a: Float64Array, k: number) => a.map((value) => value * k);
  const detection = detectStreamGrid(
    scaled(lx, kx),
    scaled(ly, ky),
    scaled(lz, kz),
    scaled(du, kx),
    scaled(dv, ky),
    scaled(dw, kz),
    len,
  );
  const grid = detection.grid;
  const [normMin, normMax] = grid ? normExtent(du, dv, dw, len) : [0, 0];

  // Starts: `starts.{x, y, z}` (the shortest wins), else Plotly's plane at the lowest y.
  const starts = trace['starts'] as Record<string, unknown> | undefined;
  let startPoints: Float64Array = new Float64Array(0);
  if (grid) {
    const sx =
      starts && isArrayLike(starts['x']) ? s.x.d2lArray(starts['x'] as ArrayLike<unknown>) : null;
    const sy =
      starts && isArrayLike(starts['y']) ? s.y.d2lArray(starts['y'] as ArrayLike<unknown>) : null;
    const sz =
      starts && isArrayLike(starts['z']) ? s.z.d2lArray(starts['z'] as ArrayLike<unknown>) : null;
    const slen = sx && sy && sz ? Math.min(sx.length, sy.length, sz.length) : 0;
    if (slen > 0) {
      startPoints = new Float64Array(slen * 3);
      for (let i = 0; i < slen; i++) {
        startPoints[i * 3] = sx![i]! * kx;
        startPoints[i * 3 + 1] = sy![i]! * ky;
        startPoints[i * 3 + 2] = sz![i]! * kz;
      }
    } else startPoints = defaultStreamStarts(grid);
  }
  const maxdisplayed = Number(trace['maxdisplayed']);
  const streams = grid
    ? integrateStreams(grid, startPoints, {
        maxLength: maxdisplayed,
        // Non-finite starts don't widen the box (they draw nothing).
        bounds: streamBounds(grid, startPoints),
      })
    : EMPTY_STREAMS;
  const sizeref = Number(trace['sizeref']);
  const { radius, tubeScale } = streamTubeRadii(
    streams,
    Number.isFinite(sizeref) ? sizeref : 1,
    minStartSeparation(startPoints),
  );

  const count = streams.divergence.length;
  const tube = new Uint32Array(count);
  for (let t = 0; t + 1 < streams.offsets.length; t++) {
    tube.fill(t, streams.offsets[t], streams.offsets[t + 1]);
  }
  const unscale = (from: Float64Array, a: number): Float64Array => {
    const out = new Float64Array(count);
    for (let i = 0; i < count; i++) out[i] = from[i * 3 + a]! / dataScale[a]!;
    return out;
  };
  const x = unscale(streams.position, 0);
  const y = unscale(streams.position, 1);
  const z = unscale(streams.position, 2);
  const u = unscale(streams.velocity, 0);
  const v = unscale(streams.velocity, 1);
  const w = unscale(streams.velocity, 2);
  const norm = new Float64Array(count);
  let maxRadius = 0;
  for (let i = 0; i < count; i++) {
    norm[i] = Math.hypot(u[i]!, v[i]!, w[i]!);
    if (radius[i]! > maxRadius) maxRadius = radius[i]!;
  }
  const pad = (e: [number, number] | undefined, a: number): [number, number] | undefined =>
    e && [e[0] - maxRadius / dataScale[a]!, e[1] + maxRadius / dataScale[a]!];
  const sampled = count > 0;
  return {
    grid,
    fill: detection.fill,
    dataScale,
    streams,
    count,
    tube,
    x,
    y,
    z,
    u,
    v,
    w,
    norm,
    divergence: streams.divergence,
    radius,
    tubeScale,
    normMin,
    normMax,
    sceneExtremes: sampled
      ? { x: pad(sceneExtent(x), 0), y: pad(sceneExtent(y), 1), z: pad(sceneExtent(z), 2) }
      : { x: extents[0], y: extents[1], z: extents[2] },
  };
}
