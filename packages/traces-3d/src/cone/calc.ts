/**
 * `cone` calc (plan E14.5): positions in linear coordinates, the vectors, their norms (the color
 * values) and the cone sizing of plotly.js `cone/convert.js` + gl-cone3d `cone.js`:
 *
 * - Every cone's vector is `vectorScale · coneScale · (u, v, w)` in linear units (drawn in scene
 *   units through the axis scales, so a cone points along its data direction on any aspect
 *   ratio); its length is that vector's, its base radius a quarter of it.
 * - `vectorScale` ({@link coneVectorScale}): with `sizemode: 'raw'` 1; otherwise the smallest
 *   "travel time" between successive points, `2 |p₁ − p₀| / (|u₀| + |u₁|)`, over the input order
 *   (not nearest neighbours), in Plotly's scaled coordinates (each axis divided by the data span).
 * - `coneScale` ({@link coneScale}): `'scaled'` → `sizeref` (default 0.5); `'absolute'` →
 *   `sizeref / max norm`; `'raw'` → `sizeref` (default 1).
 * - `anchor` → where the point sits along the cone, from the tail: `tail` 0, `cm` 0.25 (the
 *   center of mass), `center` 0.5, `tip` 1.
 * - Autorange: the positions padded by `span · vectorScale · coneScale · max norm` on every axis
 *   (Plotly's `_pad`; span: 1 for `tip` / `tail`, 0.75 for `cm`, 0.5 for `center`).
 */
import { isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import type { CalcContext } from '@mk7s/holochart-runtime';
import { sceneExtent, sceneScales } from '../scene/axes.ts';
import type { SceneCalc } from '../scene/layout.ts';
import { sceneOf } from '../scene/layout-defaults.ts';

export type ConeSizemode = 'scaled' | 'absolute' | 'raw';
export type ConeAnchor = 'tip' | 'tail' | 'cm' | 'center';

/** Where the point sits along the cone, from the tail (gl-cone3d's `coneOffset`). */
export const CONE_OFFSET: Readonly<Record<ConeAnchor, number>> = {
  tip: 1,
  tail: 0,
  cm: 0.25,
  center: 0.5,
};

/** How far the cone reaches from its point, in cone lengths (Plotly's `anchor2coneSpan`). */
export const CONE_SPAN: Readonly<Record<ConeAnchor, number>> = {
  tip: 1,
  tail: 1,
  cm: 0.75,
  center: 0.5,
};

export interface ConeCalc extends SceneCalc {
  /** Number of cones: the shortest of `x`, `y`, `z`, `u`, `v`, `w`. */
  readonly count: number;
  /** Positions, linear coordinates. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
  /** Vectors (NaN for non-numbers). */
  readonly u: Float64Array;
  readonly v: Float64Array;
  readonly w: Float64Array;
  /** `|(u, v, w)|` per cone. */
  readonly norm: Float64Array;
  /** Finite min / max norm (0 / 0 without any). */
  readonly normMin: number;
  readonly normMax: number;
  /** A cone's vector is `vectorScale · coneScale · (u, v, w)` (linear units). */
  readonly vectorScale: number;
  readonly coneScale: number;
  /** The anchor's position along the cone, from the tail ({@link CONE_OFFSET}). */
  readonly offset: number;
}

function numbers(v: unknown, n: number): Float64Array {
  const out = new Float64Array(n);
  const a = isArrayLike(v) ? (v as ArrayLike<unknown>) : [];
  for (let i = 0; i < n; i++) {
    const x = a[i];
    out[i] = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? +x : NaN;
  }
  return out;
}

/**
 * gl-cone3d's `vectorScale`: the smallest `2 |p − p′| / (|u| + |u′|)` over successive points
 * (`p′` the last point kept: a pair with a zero or undefined ratio — coinciding points, zero
 * vectors — is skipped without advancing it); 1 when there is none. Positions and vectors as
 * Plotly passes them (scaled by `dataScale`).
 */
export function coneVectorScale(
  p: readonly [ArrayLike<number>, ArrayLike<number>, ArrayLike<number>],
  u: readonly [ArrayLike<number>, ArrayLike<number>, ArrayLike<number>],
  count: number,
): number {
  let scale = Infinity;
  let prev = 0;
  const len = (i: number) => Math.hypot(u[0][i]!, u[1][i]!, u[2][i]!);
  for (let i = 1; i < count; i++) {
    const dist = Math.hypot(p[0][i]! - p[0][prev]!, p[1][i]! - p[1][prev]!, p[2][i]! - p[2][prev]!);
    const q = (2 * dist) / (len(prev) + len(i));
    // `q` 0 or NaN: skip this point (keep `prev`); Infinity (zero vectors apart) changes nothing.
    if (!q) continue;
    scale = Math.min(scale, q);
    prev = i;
  }
  return Number.isFinite(scale) ? scale : 1;
}

/** gl-cone3d's `coneScale` as plotly.js sets it per `sizemode`. */
export function coneScale(sizemode: ConeSizemode, sizeref: number, normMax: number): number {
  if (sizemode === 'raw') return sizeref || 1;
  if (sizemode === 'absolute') return sizeref && normMax ? sizeref / normMax : 0.5;
  return sizeref || 0.5;
}

/** The `cone` calc (see the module comment). */
export function calcCone(trace: FullTrace, ctx: CalcContext): ConeCalc {
  const s = sceneScales(ctx.fullLayout, sceneOf(trace));
  const col = (k: string): ArrayLike<unknown> =>
    isArrayLike(trace[k]) ? (trace[k] as ArrayLike<unknown>) : [];
  const count = Math.min(...['x', 'y', 'z', 'u', 'v', 'w'].map((k) => col(k).length));
  const x = s.x.d2lArray(col('x')).subarray(0, count);
  const y = s.y.d2lArray(col('y')).subarray(0, count);
  const z = s.z.d2lArray(col('z')).subarray(0, count);
  const u = numbers(trace['u'], count);
  const v = numbers(trace['v'], count);
  const w = numbers(trace['w'], count);
  const norm = new Float64Array(count);
  let normMin = Infinity;
  let normMax = -Infinity;
  for (let i = 0; i < count; i++) {
    const n = Math.hypot(u[i]!, v[i]!, w[i]!);
    norm[i] = n;
    if (n < normMin) normMin = n;
    if (n > normMax) normMax = n;
  }
  if (!(normMin <= normMax)) normMin = normMax = 0;
  const extents = [sceneExtent(x), sceneExtent(y), sceneExtent(z)];
  const sizemode = (trace['sizemode'] ?? 'scaled') as ConeSizemode;
  let vectorScale = 1;
  if (sizemode !== 'raw') {
    // Plotly's scaled coordinates: each axis divided by its data span (positions and vectors).
    const k = extents.map((e) => (e && e[1] > e[0] ? 1 / (e[1] - e[0]) : 1));
    const scaled = (a: Float64Array, axis: number) => a.map((value) => value * k[axis]!);
    vectorScale = coneVectorScale(
      [scaled(x, 0), scaled(y, 1), scaled(z, 2)],
      [scaled(u, 0), scaled(v, 1), scaled(w, 2)],
      count,
    );
  }
  const sizeref = Number(trace['sizeref']);
  const cs = coneScale(sizemode, Number.isFinite(sizeref) ? sizeref : 0, normMax);
  const anchor = (trace['anchor'] ?? 'cm') as ConeAnchor;
  const pad = (CONE_SPAN[anchor] ?? 0.75) * vectorScale * cs * normMax;
  const padded = (e: readonly [number, number] | undefined): [number, number] | undefined =>
    e && Number.isFinite(pad) ? [e[0] - pad, e[1] + pad] : e && [e[0], e[1]];
  return {
    count,
    x,
    y,
    z,
    u,
    v,
    w,
    norm,
    normMin,
    normMax,
    vectorScale,
    coneScale: cs,
    offset: CONE_OFFSET[anchor] ?? 0.25,
    sceneExtremes: { x: padded(extents[0]), y: padded(extents[1]), z: padded(extents[2]) },
  };
}
