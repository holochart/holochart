/**
 * `scatter` calc and autorange extremes (plan E9.1, E9.2, E9.7, E3.2). Pure: data space → linear
 * coordinates through the axes' scales (plan §4.3), kept as `Float64Array`s so the render layer
 * can apply relative-to-center encoding (E16.4). Marker sizes and error bars are resolved here
 * because they pad the autorange (Plotly: `marker.size` and `error_*` are `calc` edits).
 */
import {
  alignPeriod,
  findExtremes,
  isArrayLike,
  toFloat64Array,
  type AxisExtremes,
  type FindExtremesOptions,
  type FullTrace,
  type Scale,
} from '@mk7s/holochart-core';
import { headPoints } from '../shared/data.ts';
import type { AxisInfo, CalcContext, TraceExtremes } from '@mk7s/holochart-runtime';
import {
  calcErrorBars,
  errorBarExtremeValues,
  type ErrorBarCalc,
} from '../shared/error-bars/index.ts';
import { hasMarkers, hasText, isBubble } from './defaults.ts';

/** Scatter calcdata: linear coordinates per point (`NaN` where a point cannot be placed). */
export interface ScatterCalc {
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** Point count (`min(x.length, y.length)`, or the length of the given coordinate). */
  readonly length: number;
  /**
   * Drawn marker diameters in CSS px: one value, or one per point after `sizeref` / `sizemode` /
   * `sizemin` (0 hides a point). 0 when markers are off.
   */
  readonly markerSize: number | Float32Array;
  /** Autorange padding in px per point (Plotly's `calcMarkerSize`), when markers are drawn. */
  readonly ppad: number | Float64Array | undefined;
  readonly errorX: ErrorBarCalc | undefined;
  readonly errorY: ErrorBarCalc | undefined;
}

/** Linear coordinates for `letter`, from the data array or from `letter0 + i·dletter`. */
function coordinates(
  trace: FullTrace,
  letter: 'x' | 'y',
  length: number,
  scale: Scale | undefined,
): Float64Array {
  const values = trace[letter];
  if (isArrayLike(values)) {
    const data = headPoints(values as ArrayLike<unknown>, length);
    if (scale) return scale.d2lArray(data, new Float64Array(length));
    return toFloat64Array(data);
  }
  const out = new Float64Array(length);
  const start = trace[`${letter}0`];
  const step = Number(trace[`d${letter}`] ?? 1);
  // Log axes step in data space (x0 + i·dx, then log10); every other type is linear in l already.
  if (scale?.type === 'log') {
    const d0 = Number(start);
    for (let i = 0; i < length; i++) out[i] = scale.d2l(d0 + i * step);
    return out;
  }
  const l0 = scale ? scale.d2l(start) : Number(start);
  for (let i = 0; i < length; i++) out[i] = l0 + i * step;
  return out;
}

/** Plotly's `alignPeriod` for `xperiod` / `yperiod` on date and linear axes. */
function aligned(
  trace: FullTrace,
  letter: 'x' | 'y',
  values: Float64Array,
  axis: AxisInfo | undefined,
): Float64Array {
  const period = trace[`${letter}period`];
  if (period === undefined || (axis && axis.type !== 'date' && axis.type !== 'linear')) {
    return values;
  }
  const out = alignPeriod(values, {
    period,
    period0: trace[`${letter}period0`],
    alignment: trace[`${letter}periodalignment`] as 'start' | 'middle' | 'end' | undefined,
    isDate: axis?.type === 'date',
  });
  return out ? out.vals : values;
}

interface FullMarker {
  size?: unknown;
  sizeref?: unknown;
  sizemin?: unknown;
  sizemode?: unknown;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * Drawn marker diameters (px): Plotly's `makeBubbleSizeFn` for per-point sizes — radius
 * `v/2 / sizeref` (`diameter`) or `sqrt(v/2 / sizeref)` (`area`), at least `sizemin` — and the
 * plain size otherwise.
 */
export function markerDiameters(trace: FullTrace, length: number): number | Float32Array {
  if (!hasMarkers(trace['mode'])) return 0;
  const marker = (trace['marker'] ?? {}) as FullMarker;
  if (!isArrayLike(marker.size)) return Math.max(0, num(marker.size, 6));
  const sizes = marker.size as ArrayLike<unknown>;
  const sizeref = num(marker.sizeref, 1) || 1;
  const sizemin = num(marker.sizemin, 0);
  const area = marker.sizemode === 'area';
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const v = i < sizes.length ? sizes[i] : undefined;
    const base =
      typeof v === 'number' ? (area ? Math.sqrt(v / 2 / sizeref) : v / 2 / sizeref) : NaN;
    out[i] = base > 0 ? 2 * Math.max(base, sizemin) : 0;
  }
  return out;
}

/**
 * Autorange padding per point in px: Plotly's `calcMarkerSize` (`max(size / (1.6·sizeref), 3)`,
 * square-rooted for `sizemode: 'area'`), which leaves a little more room than the marker radius
 * for symbols that overshoot their nominal size.
 */
export function markerPadding(trace: FullTrace, length: number): number | Float64Array | undefined {
  if (!hasMarkers(trace['mode'])) return undefined;
  const marker = (trace['marker'] ?? {}) as FullMarker;
  const sizeref = 1.6 * (num(marker.sizeref, 1) || 1);
  const trans =
    marker.sizemode === 'area'
      ? (v: number): number => Math.max(Math.sqrt((v || 0) / sizeref), 3)
      : (v: number): number => Math.max((v || 0) / sizeref, 3);
  if (!isArrayLike(marker.size)) return trans(num(marker.size, 6));
  const sizes = marker.size as ArrayLike<unknown>;
  const out = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    const v = i < sizes.length ? sizes[i] : undefined;
    out[i] = trans(typeof v === 'number' && Number.isFinite(v) ? v : 0);
  }
  return out;
}

/** Scatter calc: linearize coordinates on the trace's axes, resolve marker sizes and error bars. */
export function calcScatter(trace: FullTrace, ctx: CalcContext): ScatterCalc {
  const length = typeof trace['_length'] === 'number' ? trace['_length'] : 0;
  const x = aligned(trace, 'x', coordinates(trace, 'x', length, ctx.xaxis?.scale), ctx.xaxis);
  const y = aligned(trace, 'y', coordinates(trace, 'y', length, ctx.yaxis?.scale), ctx.yaxis);
  return {
    x,
    y,
    length,
    markerSize: markerDiameters(trace, length),
    ppad: markerPadding(trace, length),
    errorX: calcErrorBars(trace, 'x', x, ctx.xaxis?.type),
    errorY: calcErrorBars(trace, 'y', y, ctx.yaxis?.type),
  };
}

/**
 * `findExtremes` on values that are already linear: a linear stand-in for the axis scale that
 * keeps its direction (reversed axes swap `ppadplus`/`ppadminus`).
 */
function linearExtremes(
  axis: AxisInfo,
  values: ArrayLike<number>,
  opts: FindExtremesOptions,
): AxisExtremes {
  const proxy = { type: 'linear', range: axis.scale.range, d2l: () => NaN } as unknown as Scale;
  return findExtremes(proxy, values, opts);
}

function withErrorBars(
  base: AxisExtremes,
  axis: AxisInfo,
  bars: ErrorBarCalc | undefined,
): AxisExtremes {
  if (!bars || bars.count === 0) return base;
  // Plotly pads error-bar ends like markers (5% extra), without px padding.
  const ends = linearExtremes(axis, errorBarExtremeValues(bars), { padded: true });
  return { ...base, min: base.min.concat(ends.min), max: base.max.concat(ends.max) };
}

/**
 * What the trace needs to be fully visible (Plotly's `calcAxisExpansion`): both axes padded by
 * the marker padding plus the 5% extra padding, except that the x axis of a trace with neither
 * markers nor text (nor y error bars) is tight, so line charts touch the plot edges. Error-bar ends
 * are included.
 */
export function scatterExtremes(
  calc: ScatterCalc,
  trace: FullTrace,
  ctx: CalcContext,
): TraceExtremes {
  const ppad = calc.ppad;
  const xOpts: FindExtremesOptions = { padded: true, ...(ppad !== undefined ? { ppad } : {}) };
  const yOpts: FindExtremesOptions = { ...xOpts };
  const errorY = (trace['error_y'] as { visible?: unknown } | undefined)?.visible === true;
  if (!errorY && !hasMarkers(trace['mode']) && !hasText(trace['mode'])) {
    xOpts.padded = false;
    xOpts.ppad = 0;
  }
  const out: { x?: AxisExtremes; y?: AxisExtremes } = {};
  if (ctx.xaxis) {
    out.x = withErrorBars(linearExtremes(ctx.xaxis, calc.x, xOpts), ctx.xaxis, calc.errorX);
  }
  if (ctx.yaxis) {
    out.y = withErrorBars(linearExtremes(ctx.yaxis, calc.y, yOpts), ctx.yaxis, calc.errorY);
  }
  return out;
}

export { isBubble };
