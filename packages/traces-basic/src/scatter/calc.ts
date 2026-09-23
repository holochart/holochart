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
  /**
   * Streaming storage (E7.2): the arrays above are views into buffers with room at both ends,
   * shared with the calc of the next `extendTraces` / `prependTraces`. Absent for a plain calc.
   */
  readonly stream?: unknown;
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
  writeCoordinates(trace, letter, scale, out, 0, length);
  return out;
}

/**
 * Linear coordinates of points `[start, end)` into `out[0 … end − start)`: the streaming calc's
 * (E7.2) counterpart of {@link coordinates}, with the same arithmetic. Two-level (multicategory)
 * data is not supported here.
 */
export function writeCoordinates(
  trace: FullTrace,
  letter: 'x' | 'y',
  scale: Scale | undefined,
  out: Float64Array,
  start: number,
  end: number,
): void {
  const values = trace[letter];
  if (isArrayLike(values)) {
    const v = values as ArrayLike<unknown>;
    const part = ArrayBuffer.isView(v)
      ? (v as unknown as Float64Array).subarray(start, end)
      : Array.prototype.slice.call(v, start, end);
    if (scale) scale.d2lArray(part, out);
    else out.set(toFloat64Array(part));
    return;
  }
  const s = trace[`${letter}0`];
  const step = Number(trace[`d${letter}`] ?? 1);
  // Log axes step in data space (x0 + i·dx, then log10); every other type is linear in l already.
  if (scale?.type === 'log') {
    const d0 = Number(s);
    for (let i = start; i < end; i++) out[i - start] = scale.d2l(d0 + i * step);
    return;
  }
  const l0 = scale ? scale.d2l(s) : Number(s);
  for (let i = start; i < end; i++) out[i - start] = l0 + i * step;
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
  const out = new Float32Array(length);
  writeMarkerDiameters(trace, out, 0, length);
  return out;
}

/**
 * Per-point diameters of points `[start, end)` into `out[0 … end − start)` (`marker.size` must be
 * an array). Shared by the full and the streaming calc (E7.2), so both give identical values.
 */
export function writeMarkerDiameters(
  trace: FullTrace,
  out: Float32Array,
  start: number,
  end: number,
): void {
  const marker = (trace['marker'] ?? {}) as FullMarker;
  const sizes = marker.size as ArrayLike<unknown>;
  const sizeref = num(marker.sizeref, 1) || 1;
  const sizemin = num(marker.sizemin, 0);
  const area = marker.sizemode === 'area';
  for (let i = start; i < end; i++) {
    const v = i < sizes.length ? sizes[i] : undefined;
    const base =
      typeof v === 'number' ? (area ? Math.sqrt(v / 2 / sizeref) : v / 2 / sizeref) : NaN;
    out[i - start] = base > 0 ? 2 * Math.max(base, sizemin) : 0;
  }
}

/**
 * Autorange padding per point in px: Plotly's `calcMarkerSize` (`max(size / (1.6·sizeref), 3)`,
 * square-rooted for `sizemode: 'area'`), which leaves a little more room than the marker radius
 * for symbols that overshoot their nominal size.
 */
export function markerPadding(trace: FullTrace, length: number): number | Float64Array | undefined {
  if (!hasMarkers(trace['mode'])) return undefined;
  const marker = (trace['marker'] ?? {}) as FullMarker;
  if (!isArrayLike(marker.size)) return paddingOf(marker)(num(marker.size, 6));
  const out = new Float64Array(length);
  writeMarkerPadding(trace, out, 0, length);
  return out;
}

function paddingOf(marker: FullMarker): (v: number) => number {
  const sizeref = 1.6 * (num(marker.sizeref, 1) || 1);
  return marker.sizemode === 'area'
    ? (v) => Math.max(Math.sqrt((v || 0) / sizeref), 3)
    : (v) => Math.max((v || 0) / sizeref, 3);
}

/** Per-point paddings of points `[start, end)` into `out[0 … end − start)` (array `marker.size`). */
export function writeMarkerPadding(
  trace: FullTrace,
  out: Float64Array,
  start: number,
  end: number,
): void {
  const marker = (trace['marker'] ?? {}) as FullMarker;
  const trans = paddingOf(marker);
  const sizes = marker.size as ArrayLike<unknown>;
  for (let i = start; i < end; i++) {
    const v = i < sizes.length ? sizes[i] : undefined;
    out[i - start] = trans(typeof v === 'number' && Number.isFinite(v) ? v : 0);
  }
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
export function linearExtremes(
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
  const opts = linearExtremeOptions(calc, trace);
  const out: { x?: AxisExtremes; y?: AxisExtremes } = {};
  if (ctx.xaxis) {
    out.x = withErrorBars(linearExtremes(ctx.xaxis, calc.x, opts.x), ctx.xaxis, calc.errorX);
  }
  if (ctx.yaxis) {
    out.y = withErrorBars(linearExtremes(ctx.yaxis, calc.y, opts.y), ctx.yaxis, calc.errorY);
  }
  return out;
}

/**
 * The `findExtremes` options of each axis (shared with the streaming autorange, E7.2): marker
 * padding plus the 5% extra padding, except a tight x axis for traces with neither markers nor
 * text (nor y error bars).
 */
export function linearExtremeOptions(
  calc: ScatterCalc,
  trace: FullTrace,
): { x: FindExtremesOptions; y: FindExtremesOptions } {
  const ppad = calc.ppad;
  const xOpts: FindExtremesOptions = { padded: true, ...(ppad !== undefined ? { ppad } : {}) };
  const yOpts: FindExtremesOptions = { ...xOpts };
  const errorY = (trace['error_y'] as { visible?: unknown } | undefined)?.visible === true;
  if (!errorY && !hasMarkers(trace['mode']) && !hasText(trace['mode'])) {
    xOpts.padded = false;
    xOpts.ppad = 0;
  }
  return { x: xOpts, y: yOpts };
}

export { isBubble };
