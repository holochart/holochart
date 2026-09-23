/**
 * Error-bar calc (plan E9.7): per-point bar ends in linear space, and the values they add to the
 * autorange. Pure; ports plotly.js `src/components/errorbars/compute_error.js` and `calc.js`.
 *
 * Plotly computes errors in "c" space (data values: 10^l on log axes, otherwise l itself), so a
 * `percent` or `sqrt` bar on a log axis is relative to the data value, not its exponent.
 */
import type { AxisType, FullTrace } from '@mk7s/holochart-core';
import type { ErrorBarType } from './attributes.ts';

/** Inputs of {@link makeComputeError}: the relevant fields of a full `error_<letter>` container. */
export interface ComputeErrorOptions {
  type: ErrorBarType;
  value?: number;
  valueminus?: number;
  symmetric: boolean;
  array?: ArrayLike<unknown>;
  arrayminus?: ArrayLike<unknown>;
}

/** Error lengths `[minus, plus]` of the point with value `c` (c space) at `index`. */
export type ComputeError = (c: number, index: number) => [minus: number, plus: number];

function makeComputeErrorValue(
  type: ErrorBarType,
  value: number | undefined,
): (c: number) => number {
  const v = value ?? NaN;
  switch (type) {
    case 'percent':
      return (c) => Math.abs((c * v) / 100);
    case 'constant':
      return () => Math.abs(v);
    case 'sqrt':
      return (c) => Math.sqrt(Math.abs(c));
    case 'data':
      // Not reached: `data` is handled by the caller.
      return () => NaN;
  }
}

/**
 * Build the error function for one error-bar container. Returns `[NaN, NaN]` (no bar) for data
 * points without a usable error.
 */
export function makeComputeError(opts: ComputeErrorOptions): ComputeError {
  if (opts.type === 'data') {
    const array = opts.array ?? [];
    if (opts.symmetric) {
      return (_c, index) => {
        const v = Number(array[index]);
        return [v, v];
      };
    }
    const arrayminus = opts.arrayminus ?? [];
    return (_c, index) => {
      const plus = Number(array[index]);
      const minus = Number(arrayminus[index]);
      // With only one side given, show it rather than nothing (handy during manual data entry).
      if (!Number.isNaN(plus) || !Number.isNaN(minus)) return [minus || 0, plus || 0];
      return [NaN, NaN];
    };
  }
  const computePlus = makeComputeErrorValue(opts.type, opts.value);
  if (opts.symmetric || opts.valueminus === undefined) {
    return (c) => {
      const v = computePlus(c);
      return [v, v];
    };
  }
  const computeMinus = makeComputeErrorValue(opts.type, opts.valueminus);
  return (c) => [computeMinus(c), computePlus(c)];
}

/** Error bars of one trace along one axis, in the axis' linear space. */
export interface ErrorBarCalc {
  readonly letter: 'x' | 'y';
  /**
   * Linear coordinate of the lower end ("shoe") per point, NaN where the point has no bar. On log
   * axes a lower end at or below zero is placed far off-screen (see `clipped`).
   */
  readonly minus: Float64Array;
  /** Linear coordinate of the upper end ("hat") per point, NaN where the point has no bar. */
  readonly plus: Float64Array;
  /** 1 where the lower end was clipped (log axis, end ≤ 0): drawn without its cross-bar. */
  readonly clipped: Uint8Array;
  /** Number of points with a bar. */
  readonly count: number;
}

/** Bars this far below the upper end (in decades) are off-screen at any sane zoom level. */
const LOG_CLIP_DECADES = 20;

function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

function arrayLike(v: unknown): ArrayLike<unknown> | undefined {
  return v !== null && typeof v === 'object' && 'length' in v
    ? (v as ArrayLike<unknown>)
    : undefined;
}

/**
 * Compute the bar ends of `trace.error_<letter>`. `coords` are the points' linear coordinates on
 * that axis (NaN for points that cannot be placed, which get no bar). Returns `undefined` when
 * the container is missing or not visible.
 */
export function calcErrorBars(
  trace: FullTrace,
  letter: 'x' | 'y',
  coords: ArrayLike<number>,
  axisType: AxisType | undefined,
): ErrorBarCalc | undefined {
  const container = trace[`error_${letter}`];
  if (container === null || typeof container !== 'object') return undefined;
  const c = container as Readonly<Record<string, unknown>>;
  if (c['visible'] !== true) return undefined;

  const computeError = makeComputeError({
    type: (c['type'] ?? 'percent') as ErrorBarType,
    value: num(c['value']),
    valueminus: num(c['valueminus']),
    symmetric: c['symmetric'] !== false,
    array: arrayLike(c['array']),
    arrayminus: arrayLike(c['arrayminus']),
  });

  const n = coords.length;
  const minus = new Float64Array(n).fill(NaN);
  const plus = new Float64Array(n).fill(NaN);
  const clipped = new Uint8Array(n);
  const log = axisType === 'log';
  let count = 0;
  for (let i = 0; i < n; i++) {
    const l = coords[i]!;
    const value = log ? 10 ** l : l;
    if (!Number.isFinite(value)) continue;
    const [errMinus, errPlus] = computeError(value, i);
    if (!Number.isFinite(errMinus) || !Number.isFinite(errPlus)) continue;
    const shoe = value - errMinus;
    const hat = value + errPlus;
    if (!Number.isFinite(shoe) || !Number.isFinite(hat)) continue;
    if (!log) {
      minus[i] = shoe;
      plus[i] = hat;
      count++;
      continue;
    }
    // A negative `data` error can pull the upper end to ≤ 0: Plotly then draws no bar at all.
    if (!(hat > 0)) continue;
    plus[i] = Math.log10(hat);
    if (shoe > 0) {
      minus[i] = Math.log10(shoe);
    } else {
      // Plotly clips the stem off-screen and hides the lower cross-bar.
      minus[i] = plus[i]! - LOG_CLIP_DECADES;
      clipped[i] = 1;
    }
    count++;
  }
  return { letter, minus, plus, clipped, count };
}

/**
 * Every bar end in linear space, for the autorange. Clipped lower ends (log axes) contribute
 * `plus − 1` instead, so a bar reaching zero widens the range by one decade rather than
 * {@link LOG_CLIP_DECADES}. Plotly pads these values like markers (`padded: true`).
 */
export function errorBarExtremeValues(calc: ErrorBarCalc): Float64Array {
  const out = new Float64Array(calc.count * 2);
  let k = 0;
  const { minus, plus, clipped } = calc;
  for (let i = 0; i < plus.length; i++) {
    const hi = plus[i]!;
    const lo = minus[i]!;
    if (!Number.isFinite(hi) || !Number.isFinite(lo)) continue;
    out[k++] = clipped[i] ? hi - 1 : lo;
    out[k++] = hi;
  }
  return k === out.length ? out : out.subarray(0, k);
}
