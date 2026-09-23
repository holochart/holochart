/**
 * `bar` calc, cross-trace calc and autorange extremes (plan E9.8, E9.9, E3.2). Pure.
 *
 * - `calc` linearizes positions (category index, ms, log10…) and keeps sizes and bases in calc
 *   space (numbers, ms, raw values on log axes), then lays the trace out on its own so it draws
 *   correctly even before (or without) a cross-trace pass.
 * - `crossTraceCalc` re-lays out every bar trace of a subplot together, per orientation, through
 *   the shared stacking helper (`shared/stack`), following `layout.barmode`.
 * - `extremes` reports the full position slots (unpadded) and the bar ends with `tozero` (Plotly).
 */
import {
  cleanNumber,
  findExtremes,
  isArrayLike,
  type AxisExtremes,
  type AxisType,
  type FullLayout,
  type FullTrace,
  type Scale,
} from '@mk7s/holochart-core';
import { headPoints } from '../shared/data.ts';
import {
  linearExtremes,
  type AxisInfo,
  type CalcContext,
  type CrossTraceContext,
  type CrossTraceEntry,
  type TraceExtremes,
} from '@mk7s/holochart-runtime';
import {
  layoutBars,
  type BarMode,
  type BarNorm,
  type StackInput,
  type StackOptions,
  type StackOutput,
} from '../shared/stack/index.ts';
import {
  calcErrorBars,
  errorBarExtremeValues,
  type ErrorBarCalc,
} from '../shared/error-bars/index.ts';
import { alignmentKey, BAR_ALIGNMENT_KEY, positionAxisId } from './defaults.ts';
import { outsideTextPadding } from './text.ts';

/** Bar calcdata. Index-aligned typed arrays, one entry per bar. */
export interface BarCalc {
  readonly length: number;
  readonly orientation: 'v' | 'h';
  /** Positions (linear coordinates of the position axis); NaN where a bar cannot be placed. */
  readonly pos: Float64Array;
  /** Lengths in calc space of the size axis (ms on date axes, raw values on log axes). */
  readonly size: Float64Array;
  /** User base per bar (calc space), 0 where unset. */
  readonly base: Float64Array;
  /** 1 where the user set a base for that bar. */
  readonly hasBase: Uint8Array;
  /** Size-axis type, when known. */
  readonly sizeType: AxisType | undefined;
  /** Position-axis type, when known. */
  readonly posType: AxisType | undefined;
  /** Layout and stacking result (updated by `crossTraceCalc`). */
  bars: StackOutput;
  /** Bar start / end on the size axis, linear. `-Infinity`: starts below a log axis. */
  s0: Float64Array;
  s1: Float64Array;
  /** Some bar starts at `-Infinity` (log axis without a positive base): draw it from the axis floor. */
  floor: boolean;
  /** Bar ends (x, y linear): where error bars attach (center of the bar's far edge). */
  ends: { x: Float64Array; y: Float64Array };
  /** Error bars along x and y, at the bar ends (after stacking, as in Plotly). */
  errorX: ErrorBarCalc | undefined;
  errorY: ErrorBarCalc | undefined;
}

/** Linear positions from the data array or from `letter0 + i·dletter`. */
function positions(
  trace: FullTrace,
  letter: 'x' | 'y',
  length: number,
  scale: Scale | undefined,
): Float64Array {
  const values = trace[letter];
  const out = new Float64Array(length);
  if (isArrayLike(values)) {
    const data = headPoints(values, length);
    if (scale) return scale.d2lArray(data, out);
    for (let i = 0; i < length; i++) out[i] = cleanNumber(data[i]);
    return out;
  }
  const start = trace[`${letter}0`];
  const step = Number(trace[`d${letter}`] ?? 1);
  if (scale?.type === 'log') {
    const d0 = cleanNumber(start);
    for (let i = 0; i < length; i++) out[i] = scale.d2l(d0 + i * step);
    return out;
  }
  const l0 = scale ? scale.d2l(start) : cleanNumber(start);
  for (let i = 0; i < length; i++) out[i] = l0 + i * step;
  return out;
}

/** A data value of the size axis in calc space: numbers, ms for dates, raw values on log axes. */
export function sizeToCalc(scale: Scale | undefined, v: unknown): number {
  if (v === null || v === undefined || v === '') return NaN;
  if (!scale || scale.type === 'log') return cleanNumber(v);
  return scale.d2l(v);
}

/** Calc space → linear on the size axis. Non-positive values on log axes give NaN. */
export function calcToLinear(type: AxisType | undefined, c: number): number {
  if (type !== 'log') return c;
  return c > 0 ? Math.log10(c) : NaN;
}

function sizes(trace: FullTrace, letter: 'x' | 'y', length: number, scale: Scale | undefined) {
  const values = trace[letter];
  const out = new Float64Array(length).fill(NaN);
  if (!isArrayLike(values)) return out;
  for (let i = 0; i < length && i < values.length; i++) out[i] = sizeToCalc(scale, values[i]);
  return out;
}

function bases(trace: FullTrace, length: number, scale: Scale | undefined) {
  const base = new Float64Array(length);
  const hasBase = new Uint8Array(length);
  const input = trace['base'];
  const scalar = isArrayLike(input) ? NaN : sizeToCalc(scale, input);
  for (let i = 0; i < length; i++) {
    const b = isArrayLike(input) ? sizeToCalc(scale, input[i]) : scalar;
    if (Number.isFinite(b)) {
      base[i] = b;
      hasBase[i] = 1;
    }
  }
  return { base, hasBase };
}

/** The axes of a bar trace, as (position, size). */
export function barAxes(
  orientation: 'v' | 'h',
  xaxis: AxisInfo | undefined,
  yaxis: AxisInfo | undefined,
): [AxisInfo | undefined, AxisInfo | undefined] {
  return orientation === 'h' ? [yaxis, xaxis] : [xaxis, yaxis];
}

/** Stacking options from the layout for bars on `positionAxis` with `orientation`. */
export function stackOptions(
  fullLayout: FullLayout,
  positionAxis: string,
  orientation: string,
  sizeType: AxisType | undefined,
): StackOptions {
  const groups = fullLayout[BAR_ALIGNMENT_KEY] as Record<string, string[]> | undefined;
  const num = (v: unknown, dflt: number): number => (typeof v === 'number' ? v : dflt);
  return {
    mode: (fullLayout['barmode'] as BarMode | undefined) ?? 'group',
    gap: num(fullLayout['bargap'], 0.2),
    groupgap: num(fullLayout['bargroupgap'], 0),
    norm: (fullLayout['barnorm'] as BarNorm | undefined) ?? '',
    sizeLog: sizeType === 'log',
    offsetGroups: (alignmentgroup) =>
      groups?.[alignmentKey(positionAxis, orientation, alignmentgroup)],
  };
}

function stackInput(calc: BarCalc, trace: FullTrace, index: number): StackInput {
  return {
    length: calc.length,
    pos: calc.pos,
    size: calc.size,
    base: calc.base,
    hasBase: calc.hasBase,
    width: trace['width'],
    offset: trace['offset'],
    offsetgroup: String(trace['offsetgroup'] ?? ''),
    alignmentgroup: String(trace['alignmentgroup'] ?? ''),
    key: String(index),
  };
}

/** Store a stacking result, its linear base/top coordinates and the error bars on the calc. */
function applyLayout(calc: BarCalc, bars: StackOutput, trace: FullTrace): void {
  calc.bars = bars;
  const n = calc.length;
  const s0 = new Float64Array(n);
  const s1 = new Float64Array(n);
  let floor = false;
  for (let i = 0; i < n; i++) {
    const top = calcToLinear(calc.sizeType, bars.top[i]!);
    let start = calcToLinear(calc.sizeType, bars.base[i]!);
    // Log axes: a bar from zero (or below) starts below the visible range (Plotly).
    if (calc.sizeType === 'log' && !(bars.base[i]! > 0) && Number.isFinite(top)) {
      start = -Infinity;
      floor = true;
    }
    s0[i] = start;
    s1[i] = top;
  }
  calc.s0 = s0;
  calc.s1 = s1;
  calc.floor = floor;
  const [x, y] = calc.orientation === 'h' ? [s1, bars.center] : [bars.center, s1];
  const [xType, yType] =
    calc.orientation === 'h' ? [calc.sizeType, calc.posType] : [calc.posType, calc.sizeType];
  calc.ends = { x, y };
  calc.errorX = calcErrorBars(trace, 'x', x, xType);
  calc.errorY = calcErrorBars(trace, 'y', y, yType);
}

/**
 * Bar calc: positions and sizes on the trace's axes, laid out as if the trace were alone
 * (`crossTraceCalc` then lays out all bars of the subplot together).
 */
export function calcBar(trace: FullTrace, ctx: CalcContext): BarCalc {
  const length = typeof trace['_length'] === 'number' ? trace['_length'] : 0;
  const orientation = trace['orientation'] === 'h' ? 'h' : 'v';
  const [pa, sa] = barAxes(orientation, ctx.xaxis, ctx.yaxis);
  const [pLetter, sLetter] = orientation === 'h' ? (['y', 'x'] as const) : (['x', 'y'] as const);
  const { base, hasBase } = bases(trace, length, sa?.scale);
  const calc: BarCalc = {
    length,
    orientation,
    pos: positions(trace, pLetter, length, pa?.scale),
    size: sizes(trace, sLetter, length, sa?.scale),
    base,
    hasBase,
    sizeType: sa?.scale.type,
    posType: pa?.scale.type,
    // Filled by the layout pass below.
    bars: undefined as unknown as StackOutput,
    s0: new Float64Array(0),
    s1: new Float64Array(0),
    floor: false,
    ends: { x: new Float64Array(0), y: new Float64Array(0) },
    errorX: undefined,
    errorY: undefined,
  };
  const options = stackOptions(ctx.fullLayout, positionAxisId(trace), orientation, calc.sizeType);
  applyLayout(calc, layoutBars([stackInput(calc, trace, ctx.index)], options)[0]!, trace);
  return calc;
}

/**
 * Cross-trace calc: lay out every bar trace of one subplot together, per orientation (each has
 * its own position axis), in trace order.
 */
export function crossTraceCalcBar(
  entries: readonly CrossTraceEntry<BarCalc>[],
  ctx: CrossTraceContext,
): void {
  for (const orientation of ['v', 'h'] as const) {
    const group = entries.filter((e) => e.calc && e.calc.orientation === orientation);
    if (group.length === 0) continue;
    const [pa, sa] = orientation === 'h' ? [ctx.yaxis, ctx.xaxis] : [ctx.xaxis, ctx.yaxis];
    const options = stackOptions(ctx.fullLayout, pa.id, orientation, sa.scale.type);
    const outputs = layoutBars(
      group.map((e) => stackInput(e.calc, e.trace, e.index)),
      options,
    );
    group.forEach((e, i) => applyLayout(e.calc, outputs[i]!, e.trace));
  }
}

/** Size-axis extremes (Plotly: bar ends, `tozero`, 5% padding, plus room for outside labels). */
function sizeExtremes(calc: BarCalc, scale: Scale | undefined, padPx: number): AxisExtremes {
  const { sizePoints, tozero, padded } = calc.bars;
  if (scale && scale.type !== 'category' && scale.type !== 'multicategory') {
    return findExtremes(scale, sizePoints, { tozero, padded, ppad: padPx });
  }
  const linear = Float64Array.from(sizePoints, (c) => calcToLinear(calc.sizeType, c));
  return { ...linearExtremes(linear, padPx, { padded }), ...(tozero ? { tozero } : {}) };
}

/** Add error-bar ends to an axis' extremes (Plotly pads them like markers, 5% extra). */
function withErrorBars(extremes: AxisExtremes, bars: ErrorBarCalc | undefined): AxisExtremes {
  if (!bars || bars.count === 0) return extremes;
  const ends = linearExtremes(errorBarExtremeValues(bars), 0, { padded: true });
  return { ...extremes, min: [...extremes.min, ...ends.min], max: [...extremes.max, ...ends.max] };
}

/** Autorange extremes: full position slots (unpadded), bar ends including zero, error bars. */
export function barExtremes(calc: BarCalc, trace: FullTrace, ctx: CalcContext): TraceExtremes {
  const sa = barAxes(calc.orientation, ctx.xaxis, ctx.yaxis)[1];
  const { posMin, posMax } = calc.bars;
  const pos: AxisExtremes =
    posMin <= posMax ? linearExtremes([posMin, posMax]) : { min: [], max: [] };
  const size = sizeExtremes(calc, sa?.scale, outsideTextPadding(trace, calc));
  const [x, y] = calc.orientation === 'h' ? [size, pos] : [pos, size];
  return { x: withErrorBars(x, calc.errorX), y: withErrorBars(y, calc.errorY) };
}
