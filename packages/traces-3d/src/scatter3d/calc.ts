/**
 * `scatter3d` calc (plan E14.2): data → linear coordinates on the scene's axes (numbers, log10,
 * ms since epoch for dates, category indices; `sceneScales`), marker diameters (bubble sizing as
 * in 2D scatter), 3D error bars (plotly.js `scatter3d/calc_errors.js`: `percent`, `constant`,
 * `sqrt`, `data`, computed in data space, then made linear) and the scene autorange, which
 * includes the error bars' ends. Pure: no three.js.
 */
import { isArrayLike, type FullTrace, type Scale } from '@mk7s/holochart-core';
import type { CalcContext } from '@mk7s/holochart-runtime';
import { sceneExtent, sceneScales } from '../scene/axes.ts';
import type { SceneCalc } from '../scene/layout.ts';
import { sceneOf } from '../scene/layout-defaults.ts';
import { hasMarkers3d } from './defaults.ts';

type Container = Readonly<Record<string, unknown>>;

/** The error bars of one axis: linear ends per point (NaN where a point has none). */
export interface ErrorBar3d {
  readonly letter: 'x' | 'y' | 'z';
  readonly minus: Float64Array;
  readonly plus: Float64Array;
  /** Points with a bar. */
  readonly count: number;
}

/** What `scatter3d`'s calc produces. */
export interface Scatter3dCalc extends SceneCalc {
  /** Point count (`_length`). */
  readonly length: number;
  /** Linear coordinates. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
  /** Marker diameters in px: one for all, or per point (bubbles). */
  readonly markerSize: number | Float32Array;
  readonly errors: readonly ErrorBar3d[];
}

function num(v: unknown, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

/** A `marker.size` value as a number (numeric strings count, as in Plotly). */
function sizeValue(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
}

/**
 * Marker diameters (px) with Plotly's bubble sizing (`sizeref`, `sizemin`, `sizemode`), as 2D
 * scatter computes them.
 */
export function markerDiameters3d(trace: FullTrace, length: number): number | Float32Array {
  if (!hasMarkers3d(trace['mode'])) return 0;
  const marker = (trace['marker'] ?? {}) as Container;
  const sizes = marker['size'];
  if (!isArrayLike(sizes)) return Math.max(0, num(sizes, 8));
  const sizeref = num(marker['sizeref'], 1) || 1;
  const sizemin = num(marker['sizemin'], 0);
  const area = marker['sizemode'] === 'area';
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const v = sizeValue(i < sizes.length ? sizes[i] : undefined);
    const base = area ? Math.sqrt(v / 2 / sizeref) : v / 2 / sizeref;
    out[i] = base > 0 ? 2 * Math.max(base, sizemin) : 0;
  }
  return out;
}

/** `[minus, plus]` error lengths of point `i` with data value `v` (NaN: no bar). */
type ComputeError = (v: number, i: number) => [number, number];

function computeError(c: Container): ComputeError {
  const type = c['type'] ?? 'percent';
  const symmetric = c['symmetric'] !== false;
  if (type === 'data') {
    const plus = isArrayLike(c['array']) ? (c['array'] as ArrayLike<unknown>) : [];
    const minus = isArrayLike(c['arrayminus']) ? (c['arrayminus'] as ArrayLike<unknown>) : [];
    return (_v, i) => {
      const p = Number(plus[i]);
      if (symmetric) return [p, p];
      const m = Number(minus[i]);
      if (!Number.isNaN(p) || !Number.isNaN(m)) return [m || 0, p || 0];
      return [NaN, NaN];
    };
  }
  const f = (value: unknown): ((v: number) => number) => {
    const k = typeof value === 'number' ? value : NaN;
    if (type === 'constant') return () => Math.abs(k);
    if (type === 'sqrt') return (v) => Math.sqrt(Math.abs(v));
    return (v) => Math.abs((v * k) / 100);
  };
  const plus = f(c['value']);
  const minus = symmetric || c['valueminus'] === undefined ? plus : f(c['valueminus']);
  return (v) => [minus(v), plus(v)];
}

/**
 * The error bars of `letter` for linear coordinates `l` on an axis with `scale` (data values
 * are `scale.l2d`-free: bars are computed on the linear value, and on `10^l` for log axes, as
 * Plotly does), or `undefined` when `error_<letter>` is not visible.
 */
export function errorBars3d(
  trace: FullTrace,
  letter: 'x' | 'y' | 'z',
  l: Float64Array,
  scale: Pick<Scale, 'type'>,
): ErrorBar3d | undefined {
  const c = trace[`error_${letter}`] as Container | undefined;
  if (!c || c['visible'] !== true) return undefined;
  const compute = computeError(c);
  const log = scale.type === 'log';
  const n = l.length;
  const minus = new Float64Array(n).fill(NaN);
  const plus = new Float64Array(n).fill(NaN);
  let count = 0;
  for (let i = 0; i < n; i++) {
    const value = log ? 10 ** l[i]! : l[i]!;
    if (!Number.isFinite(value)) continue;
    const [em, ep] = compute(value, i);
    if (!Number.isFinite(em) || !Number.isFinite(ep)) continue;
    const lo = value - em;
    const hi = value + ep;
    if (log) {
      if (!(hi > 0)) continue;
      plus[i] = Math.log10(hi);
      // A lower end at or below zero runs to the axis' end (Plotly clips it).
      minus[i] = lo > 0 ? Math.log10(lo) : -Infinity;
    } else {
      minus[i] = lo;
      plus[i] = hi;
    }
    count++;
  }
  return count > 0 ? { letter, minus, plus, count } : undefined;
}

/** Union of an extent with the finite ends of error bars. */
function withErrors(
  extent: [number, number] | undefined,
  bars: ErrorBar3d | undefined,
): [number, number] | undefined {
  if (!bars) return extent;
  const lo = sceneExtent(bars.minus);
  const hi = sceneExtent(bars.plus);
  let out = extent;
  for (const e of [lo, hi]) {
    if (!e) continue;
    out = out ? [Math.min(out[0], e[0]), Math.max(out[1], e[1])] : [e[0], e[1]];
  }
  return out;
}

/** `scatter3d` calc (see the module comment). */
export function calcScatter3d(trace: FullTrace, ctx: CalcContext): Scatter3dCalc {
  const scales = sceneScales(ctx.fullLayout, sceneOf(trace));
  const length = typeof trace['_length'] === 'number' ? trace['_length'] : 0;
  const lin = (letter: 'x' | 'y' | 'z'): Float64Array => {
    const data = trace[letter];
    const out = new Float64Array(length).fill(NaN);
    if (!isArrayLike(data)) return out;
    const l = scales[letter].d2lArray(data as ArrayLike<unknown>);
    out.set(l.length > length ? l.subarray(0, length) : l);
    return out;
  };
  const x = lin('x');
  const y = lin('y');
  const z = lin('z');
  const errors: ErrorBar3d[] = [];
  const extremes: Partial<Record<'x' | 'y' | 'z', [number, number] | undefined>> = {};
  for (const [letter, l] of [
    ['x', x],
    ['y', y],
    ['z', z],
  ] as const) {
    const bars = errorBars3d(trace, letter, l, scales[letter]);
    if (bars) errors.push(bars);
    extremes[letter] = withErrors(sceneExtent(l), bars);
  }
  return {
    length,
    x,
    y,
    z,
    markerSize: markerDiameters3d(trace, length),
    errors,
    sceneExtremes: extremes,
  };
}
