/**
 * `r` / `theta` → calc coordinates of polar traces (plan E11.4): the radial *linear* coordinate
 * (log10 on log axes, category index, ms on date axes) and the angular calc value (radians on
 * linear angular axes, category index on category axes), following plotly.js'
 * `radialAxis.makeCalcdata` and the angular `makeCalcdata` / `d2c` (`plots/polar/set_convert.js`).
 */
import {
  cleanNumber,
  isArrayLike,
  type FullLayout,
  type FullTrace,
  type Scale,
} from '@mk7s/holochart-core';
import { angularConvertOf, radialScaleOf, type AngularConvert } from './subplot.ts';
import { subplotOf } from './layout-defaults.ts';

/** A trace's polar coordinates in calc space. */
export interface PolarCoordinates {
  /** Radial linear coordinates (NaN where a point can't be placed). */
  readonly r: Float64Array;
  /** Angular calc values: radians (linear axes) or category indices. */
  readonly theta: Float64Array;
  readonly length: number;
  /** The radial scale the `r` values were converted with (type, categories). */
  readonly radialScale: Scale;
  readonly angular: AngularConvert;
}

/** A `theta` in `unit` → radians. Gradians too (plotly.js reads them as radians). */
export function toRadians(v: number, unit: unknown): number {
  if (unit === 'degrees') return (v / 180) * Math.PI;
  if (unit === 'gradians') return (v / 200) * Math.PI;
  return v;
}

/** One `theta` value → the angular calc value. */
export function thetaToCalc(v: unknown, unit: unknown, angular: AngularConvert): number {
  if (angular.type === 'category') {
    if (v === null || v === undefined) return NaN;
    return angular.index.get(String(v)) ?? NaN;
  }
  const n = typeof v === 'number' ? v : cleanNumber(v);
  return Number.isFinite(n) ? toRadians(n, unit) : NaN;
}

/** The subplot container a polar trace is on. */
export function polarLayoutOf(
  trace: FullTrace,
  fullLayout: FullLayout,
): Record<string, unknown> | undefined {
  const c = fullLayout[subplotOf(trace)];
  return c !== null && typeof c === 'object' ? (c as Record<string, unknown>) : undefined;
}

/** Convert a defaulted polar trace's `r` / `theta` (or their implicit forms). */
export function polarCoordinates(trace: FullTrace, fullLayout: FullLayout): PolarCoordinates {
  const polar = polarLayoutOf(trace, fullLayout);
  const radialScale = radialScaleOf(polar);
  const angular = angularConvertOf(polar);
  const length = typeof trace['_length'] === 'number' ? trace['_length'] : 0;
  const unit = trace['thetaunit'];

  const r = new Float64Array(length);
  const rIn = trace['r'];
  if (isArrayLike(rIn)) {
    const values = rIn as ArrayLike<unknown>;
    for (let i = 0; i < length; i++) r[i] = radialScale.d2l(values[i]);
  } else {
    const r0 = trace['r0'];
    const dr = typeof trace['dr'] === 'number' ? trace['dr'] : 1;
    if (radialScale.type === 'log') {
      const d0 = cleanNumber(r0);
      for (let i = 0; i < length; i++) r[i] = radialScale.d2l(d0 + i * dr);
    } else {
      const l0 = radialScale.d2l(r0);
      for (let i = 0; i < length; i++) r[i] = l0 + i * dr;
    }
  }

  const theta = new Float64Array(length);
  const tIn = trace['theta'];
  if (isArrayLike(tIn)) {
    const values = tIn as ArrayLike<unknown>;
    for (let i = 0; i < length; i++) theta[i] = thetaToCalc(values[i], unit, angular);
  } else {
    const t0 = trace['theta0'] === undefined ? 0 : thetaToCalc(trace['theta0'], unit, angular);
    const dt = trace['dtheta'];
    const step =
      typeof dt === 'number' && dt !== 0
        ? angular.type === 'category'
          ? dt
          : toRadians(dt, unit)
        : angular.period / Math.max(1, length);
    const start = Number.isFinite(t0) ? t0 : 0;
    for (let i = 0; i < length; i++) theta[i] = start + i * step;
  }
  return { r, theta, length, radialScale, angular };
}

/**
 * Point count of a polar trace (plotly.js `handleRThetaDefaults`): both arrays → the shorter one,
 * one array → its length (the other coordinate is implicit), none → 0 (the trace is hidden).
 */
export function polarLength(r: unknown, theta: unknown): number {
  const nr = isArrayLike(r) ? r.length : undefined;
  const nt = isArrayLike(theta) ? theta.length : undefined;
  if (nr !== undefined && nt !== undefined) return Math.min(nr, nt);
  return nr ?? nt ?? 0;
}
