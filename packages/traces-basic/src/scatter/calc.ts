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
  type CategorySamples,
  type FindExtremesOptions,
  type FullTrace,
  type Scale,
} from '@mk7s/holochart-core';
import { headPoints } from '../shared/data.ts';
import type { AxisInfo, CalcContext, TraceAppend, TraceExtremes } from '@mk7s/holochart-runtime';
import {
  calcErrorBars,
  errorBarExtremeValues,
  type ErrorBarCalc,
} from '../shared/error-bars/index.ts';
import { hasMarkers, hasText, isBubble } from './defaults.ts';

/**
 * A stacked trace's cross-trace calc (E9.4), written by `crossTraceCalc`: the `x` / `y` of the
 * calc then hold each point's stacked position.
 */
export interface ScatterStack {
  /** The coordinates calc produced, before stacking (so a rerun restacks from scratch). */
  readonly raw: { readonly x: Float64Array; readonly y: Float64Array };
  /** The stacked series the line and fill follow: one vertex per slot of the group (linear). */
  readonly path: { readonly x: Float64Array; readonly y: Float64Array };
  /** Per point: its own size after `groupnorm` (calc space), what hover reports. */
  readonly value: Float64Array;
  /** The point behind each slot of `path`, or -1 for gaps (no marker, no autorange padding). */
  readonly slotIndex: Int32Array;
  /** The stacking direction: `'v'` stacks y values. */
  readonly orientation: 'v' | 'h';
  /** Whether `groupnorm` is set (hover then reports the normalized size). */
  readonly normalized: boolean;
}

/** A trace's place among the scatter traces of its subplot (E9.4), set by `crossTraceCalc`. */
export interface ScatterLink {
  /** The trace a `tonext*` fill fills to: the previous one in the same `stackgroup` (or none). */
  readonly previous?: {
    readonly calc: ScatterCalc;
    readonly trace: FullTrace;
    readonly index: number;
  };
  /** First scatter trace of its stack group (or of the unstacked ones) on the subplot. */
  readonly first: boolean;
}

/** Scatter calcdata: linear coordinates per point (`NaN` where a point cannot be placed). */
export interface ScatterCalc {
  /** Per-point linear coordinates; stacked positions once `crossTraceCalc` stacked the trace. */
  x: Float64Array;
  y: Float64Array;
  /** Point count (`min(x.length, y.length)`, or the length of the given coordinate). */
  readonly length: number;
  /**
   * Drawn marker diameters in CSS px: one value, or one per point after `sizeref` / `sizemode` /
   * `sizemin` (0 hides a point). 0 when markers are off.
   */
  readonly markerSize: number | Float32Array;
  /** Autorange padding in px per point (Plotly's `calcMarkerSize`), when markers are drawn. */
  readonly ppad: number | Float64Array | undefined;
  errorX: ErrorBarCalc | undefined;
  errorY: ErrorBarCalc | undefined;
  /**
   * Streaming storage (E7.2): the arrays above are views into buffers with room at both ends,
   * shared with the calc of the next `extendTraces` / `prependTraces`. Absent for a plain calc.
   */
  readonly stream?: unknown;
  /**
   * Set by `calcAppend` (E7.2): this calc is `previous` plus `append`. Views and `extremes` use it
   * to take the streaming path even when `crossTraceCalc` made the runtime drop `plan.append`.
   * Cleared on `previous` when the next streamed calc is made, so at most two calcs stay alive.
   */
  appendOf?: { readonly previous: ScatterCalc; readonly append: TraceAppend } | undefined;
  /** Stacking (E9.4), set by `crossTraceCalc` for traces in a `stackgroup`. */
  stack?: ScatterStack | undefined;
  /** Fill linking (E9.4), set by `crossTraceCalc`. */
  link?: ScatterLink | undefined;
}

/**
 * The series a trace's line and fill follow: the stacked series (with the positions only other
 * traces of the group have) for stacked traces, the points otherwise.
 */
export function drawnSeries(calc: ScatterCalc): { x: Float64Array; y: Float64Array } {
  return calc.stack?.path ?? calc;
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
    const v = sizeValue(i < sizes.length ? sizes[i] : undefined);
    const base = area ? Math.sqrt(v / 2 / sizeref) : v / 2 / sizeref;
    out[i - start] = base > 0 ? 2 * Math.max(base, sizemin) : 0;
  }
}

/** A per-point `marker.size` as a number: numeric strings count, as in Plotly's calcdata. */
function sizeValue(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
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
    const v = sizeValue(i < sizes.length ? sizes[i] : undefined);
    out[i - start] = trans(Number.isFinite(v) ? v : 0);
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
 * Samples for value-based `categoryorder`s (E3.6), as Plotly's `sortAxisCategoriesByValue` reads
 * scatter calcdata: the category index is the point's coordinate on `axis`, the value its other
 * coordinate in calc space (data values on a log axis, not their log10).
 */
export function scatterCategoryValues(
  calc: ScatterCalc,
  _trace: FullTrace,
  axis: 'x' | 'y',
  ctx: CalcContext,
): CategorySamples {
  const other = axis === 'x' ? calc.y : calc.x;
  const otherAxis = axis === 'x' ? ctx.yaxis : ctx.xaxis;
  const value = otherAxis?.type === 'log' ? other.map((l) => 10 ** l) : other;
  return { index: axis === 'x' ? calc.x : calc.y, value };
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
  const opts = linearExtremeOptions(calc, trace, ctx);
  const out: { x?: AxisExtremes; y?: AxisExtremes } = {};
  // Stacked traces span their whole stacked series (Plotly), gaps without marker padding.
  const series = drawnSeries(calc);
  if (ctx.xaxis) {
    out.x = withErrorBars(linearExtremes(ctx.xaxis, series.x, opts.x), ctx.xaxis, calc.errorX);
  }
  if (ctx.yaxis) {
    out.y = withErrorBars(linearExtremes(ctx.yaxis, series.y, opts.y), ctx.yaxis, calc.errorY);
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
  ctx?: Pick<CalcContext, 'xaxis' | 'yaxis'>,
): { x: FindExtremesOptions; y: FindExtremesOptions } {
  const ppad = calc.stack ? stackPadding(calc) : calc.ppad;
  const xOpts: FindExtremesOptions = { padded: true, ...(ppad !== undefined ? { ppad } : {}) };
  const yOpts: FindExtremesOptions = { ...xOpts };
  const errorY = (trace['error_y'] as { visible?: unknown } | undefined)?.visible === true;
  const fill = typeof trace['fill'] === 'string' ? trace['fill'] : 'none';
  // Plotly's `calcAxisExpansion`: fills to zero (or to the axis, for the first trace of a
  // `tonext*` chain) include zero, unless the path is closed (it then just fills its shape).
  const { x, y } = drawnSeries(calc);
  const n = x.length;
  const openEnded = n < 2 || x[0] !== x[n - 1] || y[0] !== y[n - 1];
  const first = calc.link?.first ?? true;
  const orientation = calc.stack?.orientation;
  // `tozero` only applies to linear axes (Plotly's `findExtremes`); our stand-in scale is linear.
  const linear = (axis: AxisInfo | undefined): boolean => !axis || axis.type === 'linear';
  if (openEnded && (fill === 'tozerox' || (fill === 'tonextx' && (first || orientation === 'h')))) {
    if (linear(ctx?.xaxis)) xOpts.tozero = true;
  } else if (
    !errorY &&
    (fill === 'tonexty' ||
      fill === 'tozeroy' ||
      (!hasMarkers(trace['mode']) && !hasText(trace['mode'])))
  ) {
    xOpts.padded = false;
    xOpts.ppad = 0;
  }
  if (openEnded && (fill === 'tozeroy' || (fill === 'tonexty' && (first || orientation === 'v')))) {
    if (linear(ctx?.yaxis)) yOpts.tozero = true;
  } else if (fill === 'tonextx' || fill === 'tozerox') {
    yOpts.padded = false;
  }
  return { x: xOpts, y: yOpts };
}

/**
 * Per-slot marker padding of a stacked series (Plotly: the point's padding, 0 at gaps and at
 * positions only other traces have).
 */
function stackPadding(calc: ScatterCalc): number | Float64Array | undefined {
  const ppad = calc.ppad;
  const stack = calc.stack;
  if (ppad === undefined || !stack) return ppad;
  const index = stack.slotIndex;
  const out = new Float64Array(index.length);
  for (let j = 0; j < index.length; j++) {
    const i = index[j] as number;
    out[j] = i < 0 ? 0 : typeof ppad === 'number' ? ppad : (ppad[i] ?? 0);
  }
  return out;
}

export { isBubble };
