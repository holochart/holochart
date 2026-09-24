/**
 * `box` calc, cross-trace calc and autorange extremes (plan E10.4; plotly.js `box/calc.js`,
 * `box/cross_trace_calc.js`). Pure, over typed arrays, so it can run in a worker (ADR-011).
 *
 * - `calc` groups the samples by distinct position (one box each), sorts them and computes the
 *   statistics (`shared/stats.ts`), or reads precomputed ones; then lays the trace out alone.
 * - `crossTraceCalc` lays out every box trace of a subplot together, per orientation (widths,
 *   group offsets), and places the points (jitter, `pointpos`).
 * - `extremes` reports the values (plus notches) on the value axis and the boxes plus room for
 *   their points on the position axis.
 *
 * `violin` reuses the sample calc and the layout (see `violin/calc.ts`).
 */
import {
  cleanNumber,
  findExtremes,
  isArrayLike,
  type AxisExtremes,
  type AxisType,
  type CategorySamples,
  type FullLayout,
  type FullTrace,
  type Scale,
} from '@mk7s/holochart-core';
import type {
  AxisInfo,
  CalcContext,
  CrossTraceContext,
  CrossTraceEntry,
  TraceExtremes,
} from '@mk7s/holochart-runtime';
import {
  boxStats,
  distinctValues,
  findBin,
  jitterOffsets,
  lowerFence,
  mean as meanOf,
  notchSpan,
  outlierBounds,
  pseudoRandom,
  upperFence,
  variance,
  type QuartileMethod,
} from '../shared/stats.ts';
import { LAYOUT_KEYS, TRACE_KEYS, positionAxisId, type BoxKind } from './defaults.ts';
import { layoutOffsets, type OffsetInput, type OffsetOutput } from './offsets.ts';

/** Which samples are drawn as points. */
export type PointsMode = 'all' | 'outliers' | 'suspectedoutliers' | false;

/** Per-box statistics, index-aligned with the boxes, in calc space of the value axis. */
export interface BoxStatArrays {
  /** Sample count. */
  readonly n: Int32Array;
  readonly min: Float64Array;
  readonly max: Float64Array;
  readonly q1: Float64Array;
  readonly med: Float64Array;
  readonly q3: Float64Array;
  readonly mean: Float64Array;
  /** Standard deviation, times `sdmultiple` for sample boxes (Plotly). */
  readonly sd: Float64Array;
  /** Whisker ends (fences). */
  readonly lf: Float64Array;
  readonly uf: Float64Array;
  /** Suspected-outlier bounds. */
  readonly lo: Float64Array;
  readonly uo: Float64Array;
  /** Notch ends. */
  readonly ln: Float64Array;
  readonly un: Float64Array;
}

/** The samples of every box, grouped by box and sorted by value. */
export interface BoxSamples {
  /** Box `b` owns samples `[start[b], start[b + 1])`. */
  readonly start: Int32Array;
  /** Value (calc space). */
  readonly value: Float64Array;
  /** Index into the trace's data arrays (the box index for precomputed boxes). */
  readonly index: Int32Array;
  /** Index within the box's sample row for precomputed boxes, else -1. */
  readonly sub: Int32Array;
  /** 1: drawn as a point (Plotly's `pts2`). */
  readonly shown: Uint8Array;
  /** 1: a suspected outlier, drawn with the outlier style (`'suspectedoutliers'` mode). */
  readonly suspected: Uint8Array;
}

/** Box calcdata (violin extends it). */
export interface BoxCalc {
  readonly kind: BoxKind;
  readonly orientation: 'v' | 'h';
  readonly posType: AxisType | undefined;
  readonly valType: AxisType | undefined;
  /** Number of boxes. */
  readonly count: number;
  /** Box positions (position-axis linear coordinates). */
  readonly pos: Float64Array;
  readonly stats: BoxStatArrays;
  readonly samples: BoxSamples;
  readonly mode: PointsMode;
  /** Precomputed statistics (not samples). */
  readonly precomputed: boolean;
  /** Value-axis extent for autorange (calc space), `[Infinity, -Infinity]` when empty. */
  readonly valueRange: readonly [number, number];
  /** Layout on the position axis (rewritten by cross-trace calc). */
  offsets: OffsetOutput;
  /** Position (linear) of each sample's point, NaN when it is not drawn. */
  pointPos: Float64Array;
}

/** A data value of the value axis in calc space: numbers, ms for dates, raw values on log axes. */
export function valueToCalc(scale: Scale | undefined, v: unknown): number {
  if (v === null || v === undefined || v === '') return NaN;
  if (!scale || scale.type === 'log') return cleanNumber(v);
  return scale.d2l(v);
}

/** Calc space → linear on the value axis (log10 on log axes, NaN for non-positive values). */
export function calcToLinear(type: AxisType | undefined, c: number): number {
  if (type !== 'log') return c;
  return c > 0 ? Math.log10(c) : NaN;
}

/** The axes of a box trace, as (position, value). */
export function boxAxes(
  orientation: 'v' | 'h',
  xaxis: AxisInfo | undefined,
  yaxis: AxisInfo | undefined,
): [AxisInfo | undefined, AxisInfo | undefined] {
  return orientation === 'h' ? [yaxis, xaxis] : [xaxis, yaxis];
}

/** The points mode of a (defaulted) box or violin. */
export function pointsMode(trace: FullTrace): PointsMode {
  const v = trace.type === 'violin' ? trace['points'] : trace['boxpoints'];
  return v === 'all' || v === 'outliers' || v === 'suspectedoutliers' ? v : false;
}

function num(v: unknown, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

function emptyStats(count: number): BoxStatArrays {
  const f = () => new Float64Array(count);
  return {
    n: new Int32Array(count),
    min: f(),
    max: f(),
    q1: f(),
    med: f(),
    q3: f(),
    mean: f(),
    sd: f(),
    lf: f(),
    uf: f(),
    lo: f(),
    uo: f(),
    ln: f(),
    un: f(),
  };
}

/** Plotly's `makeBins`: edges halfway between distinct positions, `dx` past the ends. */
function makeBins(x: readonly number[], dx: number): Float64Array {
  const bins = new Float64Array(x.length + 1);
  for (let i = 0; i < x.length; i++) bins[i] = x[i]! - dx;
  bins[x.length] = x[x.length - 1]! + dx;
  return bins;
}

/** Linear positions of the samples (sample boxes) or of the boxes (precomputed). */
function positionsOf(
  trace: FullTrace,
  letter: 'x' | 'y',
  length: number,
  scale: Scale | undefined,
): Float64Array {
  const out = new Float64Array(length);
  const values = trace[letter];
  const d2l = (v: unknown): number => (scale ? scale.d2l(v) : cleanNumber(v));
  if (isArrayLike(values) && trace[TRACE_KEYS.implicit] === true) {
    let p = d2l(values[0]);
    // A name that does not fit the axis after all: the trace's index (Plotly's `num`).
    if (!Number.isFinite(p)) p = num(trace[TRACE_KEYS.num], 0);
    return out.fill(p);
  }
  if (isArrayLike(values)) {
    if (scale)
      return scale.d2lArray(
        values.length > length ? Array.prototype.slice.call(values, 0, length) : values,
        out,
      );
    for (let i = 0; i < length; i++) out[i] = cleanNumber(values[i]);
    return out;
  }
  // Precomputed boxes without positions: `x0 + i·dx`.
  const start = trace[`${letter}0`];
  const step = num(trace[`d${letter}`], 1);
  if (scale?.type === 'log') {
    const s = cleanNumber(start);
    for (let i = 0; i < length; i++) out[i] = scale.d2l(s + i * step);
    return out;
  }
  const l0 = d2l(start ?? 0);
  for (let i = 0; i < length; i++) out[i] = (Number.isFinite(l0) ? l0 : 0) + i * step;
  return out;
}

/** Mark the drawn points and suspected outliers of box `b` (Plotly's `pts2` and `pt.so`). */
function tagPoints(
  samples: { value: Float64Array; shown: Uint8Array; suspected: Uint8Array },
  from: number,
  to: number,
  stats: BoxStatArrays,
  b: number,
  mode: PointsMode,
): void {
  if (!mode) return;
  const lf = stats.lf[b]!;
  const uf = stats.uf[b]!;
  const lo = stats.lo[b]!;
  const uo = stats.uo[b]!;
  for (let k = from; k < to; k++) {
    const v = samples.value[k]!;
    const shown = mode === 'all' || v < lf || v > uf;
    samples.shown[k] = shown ? 1 : 0;
    // Plotly tags points between the whiskers and the 3 IQR bounds (`v < uo && v > lo`).
    if (shown && mode === 'suspectedoutliers' && v < uo && v > lo) samples.suspected[k] = 1;
  }
}

/** Sample boxes: group by distinct position, sort, compute the statistics. */
function sampleCalc(
  trace: FullTrace,
  length: number,
  posRaw: Float64Array,
  values: Float64Array,
  method: QuartileMethod,
  mode: PointsMode,
): Omit<BoxCalc, 'kind' | 'orientation' | 'posType' | 'valType' | 'offsets' | 'pointPos'> {
  const dv = distinctValues(posRaw);
  const distinct = dv.values;
  const bins = makeBins(distinct, dv.minDiff / 2);
  const binOf = new Int32Array(length);
  const counts = new Int32Array(distinct.length);
  for (let i = 0; i < length; i++) {
    const v = values[i]!;
    const p = posRaw[i]!;
    let n = -1;
    if (Number.isFinite(v) && Number.isFinite(p)) {
      n = findBin(p, bins);
      if (n >= distinct.length) n = -1;
    }
    binOf[i] = n;
    if (n >= 0) counts[n]!++;
  }
  // Boxes are the positions with samples, in position order.
  const boxOfBin = new Int32Array(distinct.length).fill(-1);
  const boxPos: number[] = [];
  for (let b = 0; b < distinct.length; b++) {
    if (counts[b]! > 0) {
      boxOfBin[b] = boxPos.length;
      boxPos.push(distinct[b]!);
    }
  }
  const count = boxPos.length;
  const start = new Int32Array(count + 1);
  for (let b = 0; b < distinct.length; b++) {
    const box = boxOfBin[b]!;
    if (box >= 0) start[box + 1] = counts[b]!;
  }
  for (let b = 0; b < count; b++) start[b + 1]! += start[b]!;
  const total = start[count]!;
  const index = new Int32Array(total);
  const fill = start.slice(0, count);
  for (let i = 0; i < length; i++) {
    const n = binOf[i]!;
    if (n < 0) continue;
    const box = boxOfBin[n]!;
    index[fill[box]!++] = i;
  }
  const value = new Float64Array(total);
  const stats = emptyStats(count);
  const shown = new Uint8Array(total);
  const suspected = new Uint8Array(total);
  const sdmultiple = num(trace['sdmultiple'], 1);
  let lo = Infinity;
  let hi = -Infinity;
  let notchLo = Infinity;
  let notchHi = -Infinity;
  for (let b = 0; b < count; b++) {
    const from = start[b]!;
    const to = start[b + 1]!;
    // Stable sort by value (ties keep data order, like Plotly's `Array#sort`).
    index.subarray(from, to).sort((a, c) => values[a]! - values[c]!);
    for (let k = from; k < to; k++) value[k] = values[index[k]!]!;
    const s = boxStats(value, method, from, to);
    stats.n[b] = s.n;
    stats.min[b] = s.min;
    stats.max[b] = s.max;
    stats.q1[b] = s.q1;
    stats.med[b] = s.median;
    stats.q3[b] = s.q3;
    stats.mean[b] = s.mean;
    stats.sd[b] = s.sd * sdmultiple;
    stats.lf[b] = s.lowerFence;
    stats.uf[b] = s.upperFence;
    stats.lo[b] = s.lowerOutlier;
    stats.uo[b] = s.upperOutlier;
    stats.ln[b] = s.median - s.notchSpan;
    stats.un[b] = s.median + s.notchSpan;
    lo = Math.min(lo, s.min);
    hi = Math.max(hi, s.max);
    notchLo = Math.min(notchLo, stats.ln[b]!);
    notchHi = Math.max(notchHi, stats.un[b]!);
    tagPoints({ value, shown, suspected }, from, to, stats, b, mode);
  }
  if (trace['notched'] === true && count > 0) {
    lo = Math.min(lo, notchLo);
    hi = Math.max(hi, notchHi);
  }
  if (trace['sizemode'] === 'sd') {
    for (let b = 0; b < count; b++) {
      lo = Math.min(lo, stats.mean[b]! - stats.sd[b]!);
      hi = Math.max(hi, stats.mean[b]! + stats.sd[b]!);
    }
  }
  return {
    count,
    pos: Float64Array.from(boxPos),
    stats,
    samples: { start, value, index, sub: new Int32Array(total).fill(-1), shown, suspected },
    mode,
    precomputed: false,
    valueRange: [lo, hi],
  };
}

/** Precomputed boxes (Plotly's `_hasPreCompStats` branch). */
function precomputedCalc(
  trace: FullTrace,
  length: number,
  posRaw: Float64Array,
  valLetter: 'x' | 'y',
  valScale: Scale | undefined,
  mode: PointsMode,
): Omit<BoxCalc, 'kind' | 'orientation' | 'posType' | 'valType' | 'offsets' | 'pointPos'> {
  const stat = (key: string, i: number): number => {
    const arr = trace[key];
    return isArrayLike(arr) ? valueToCalc(valScale, arr[i]) : NaN;
  };
  const rows = trace[valLetter];
  const boxes: number[] = [];
  for (let i = 0; i < length; i++) if (Number.isFinite(posRaw[i]!)) boxes.push(i);
  const count = boxes.length;
  const start = new Int32Array(count + 1);
  const sampleValues: number[] = [];
  const sampleIndex: number[] = [];
  const sampleSub: number[] = [];
  for (let b = 0; b < count; b++) {
    const i = boxes[b]!;
    const row = isArrayLike(rows) ? rows[i] : undefined;
    const pts: { v: number; j: number }[] = [];
    if (isArrayLike(row)) {
      for (let j = 0; j < row.length; j++) {
        const v = valueToCalc(valScale, row[j]);
        if (Number.isFinite(v)) pts.push({ v, j });
      }
    }
    pts.sort((a, c) => a.v - c.v);
    for (const p of pts) {
      sampleValues.push(p.v);
      sampleIndex.push(i);
      sampleSub.push(p.j);
    }
    start[b + 1] = sampleValues.length;
  }
  const total = sampleValues.length;
  const value = Float64Array.from(sampleValues);
  const stats = emptyStats(count);
  const shown = new Uint8Array(total);
  const suspected = new Uint8Array(total);
  const notched = trace['notched'] === true;
  let lo = Infinity;
  let hi = -Infinity;
  for (let b = 0; b < count; b++) {
    const i = boxes[b]!;
    const from = start[b]!;
    const to = start[b + 1]!;
    const n = to - from;
    stats.n[b] = n;
    const q1 = stat('q1', i);
    const med = stat('median', i);
    const q3 = stat('q3', i);
    if (
      Number.isFinite(med) &&
      Number.isFinite(q1) &&
      Number.isFinite(q3) &&
      med >= q1 &&
      q3 >= med
    ) {
      const lfIn = stat('lowerfence', i);
      const lf = Number.isFinite(lfIn) && lfIn <= q1 ? lfIn : lowerFence(value, q1, q3, from, to);
      const ufIn = stat('upperfence', i);
      const uf = Number.isFinite(ufIn) && ufIn >= q3 ? ufIn : upperFence(value, q1, q3, from, to);
      const meanIn = stat('mean', i);
      const m = Number.isFinite(meanIn) ? meanIn : n ? meanOf(value, from, to) : (q1 + q3) / 2;
      const sdIn = stat('sd', i);
      const sd =
        Number.isFinite(meanIn) && sdIn >= 0
          ? sdIn
          : n
            ? Math.sqrt(variance(value, m, n, from, to))
            : q3 - q1;
      const [lob, uob] = outlierBounds(q1, q3);
      const nsIn = stat('notchspan', i);
      const ns = Number.isFinite(nsIn) && nsIn > 0 ? nsIn : notchSpan(q1, q3, n);
      let imin = lf;
      let imax = uf;
      if (mode && n > 0) {
        imin = Math.min(imin, value[from]!);
        imax = Math.max(imax, value[to - 1]!);
      }
      if (notched) {
        imin = Math.min(imin, med - ns);
        imax = Math.max(imax, med + ns);
      }
      stats.q1[b] = q1;
      stats.med[b] = med;
      stats.q3[b] = q3;
      stats.lf[b] = lf;
      stats.uf[b] = uf;
      stats.mean[b] = m;
      stats.sd[b] = sd;
      stats.lo[b] = lob;
      stats.uo[b] = uob;
      stats.ln[b] = med - ns;
      stats.un[b] = med + ns;
      stats.min[b] = imin;
      stats.max[b] = imax;
    } else {
      // Invalid statistics: Plotly warns and draws the box as a line at one value.
      const v0 = Number.isFinite(med)
        ? med
        : Number.isFinite(q1)
          ? Number.isFinite(q3)
            ? (q1 + q3) / 2
            : q1
          : Number.isFinite(q3)
            ? q3
            : 0;
      for (const key of [
        'q1',
        'med',
        'q3',
        'lf',
        'uf',
        'mean',
        'sd',
        'ln',
        'un',
        'min',
        'max',
        'lo',
        'uo',
      ] as const) {
        stats[key][b] = v0;
      }
    }
    lo = Math.min(lo, stats.min[b]!);
    hi = Math.max(hi, stats.max[b]!);
    tagPoints({ value, shown, suspected }, from, to, stats, b, mode);
  }
  return {
    count,
    pos: Float64Array.from(boxes, (i) => posRaw[i]!),
    stats,
    samples: {
      start,
      value,
      index: Int32Array.from(sampleIndex),
      sub: Int32Array.from(sampleSub),
      shown,
      suspected,
    },
    mode,
    precomputed: true,
    valueRange: [lo, hi],
  };
}

/** The part of box calc violin shares: positions, samples and statistics, before any layout. */
export function calcBoxSamples(trace: FullTrace, ctx: CalcContext, kind: BoxKind): BoxCalc {
  const length = typeof trace['_length'] === 'number' ? trace['_length'] : 0;
  const orientation = trace['orientation'] === 'h' ? 'h' : 'v';
  const [pa, va] = boxAxes(orientation, ctx.xaxis, ctx.yaxis);
  const [posLetter, valLetter] =
    orientation === 'h' ? (['y', 'x'] as const) : (['x', 'y'] as const);
  const mode = pointsMode(trace);
  const method = (trace['quartilemethod'] as QuartileMethod | undefined) ?? 'linear';
  const posRaw = positionsOf(trace, posLetter, length, pa?.scale);
  let core: ReturnType<typeof sampleCalc>;
  if (trace[TRACE_KEYS.precomputed] === true) {
    core = precomputedCalc(trace, length, posRaw, valLetter, va?.scale, mode);
  } else {
    const raw = trace[valLetter];
    const values = new Float64Array(length).fill(NaN);
    if (isArrayLike(raw)) {
      for (let i = 0; i < length && i < raw.length; i++) values[i] = valueToCalc(va?.scale, raw[i]);
    }
    core = sampleCalc(trace, length, posRaw, values, method, mode);
  }
  const calc: BoxCalc = {
    kind,
    orientation,
    posType: pa?.scale.type,
    valType: va?.scale.type,
    ...core,
    offsets: { dPos: 0.5, bPos: 0, bdPos: 0, wHover: 0, extremes: { min: [], max: [] } },
    pointPos: new Float64Array(core.samples.value.length).fill(NaN),
  };
  return calc;
}

/** Layout options of `kind` for one position axis. */
function offsetOptions(fullLayout: FullLayout, kind: BoxKind, posType: AxisType | undefined) {
  const n = (v: unknown, d: number) => (typeof v === 'number' ? v : d);
  return {
    mode: fullLayout[`${kind}mode`] === 'group' ? ('group' as const) : ('overlay' as const),
    gap: n(fullLayout[`${kind}gap`], 0.3),
    groupgap: n(fullLayout[`${kind}groupgap`], 0.3),
    total: n(fullLayout[LAYOUT_KEYS[kind].count], 1),
    category: posType === 'category' || posType === 'multicategory',
  };
}

function offsetInput(calc: BoxCalc, trace: FullTrace, fullLayout: FullLayout): OffsetInput {
  const kind = calc.kind;
  const groups = fullLayout[LAYOUT_KEYS[kind].alignment] as Record<string, string[]> | undefined;
  const key = `${positionAxisId(trace)}|${calc.orientation}|${String(trace['alignmentgroup'] ?? '')}`;
  let shownCount = 0;
  const shown = calc.samples.shown;
  for (let k = 0; k < shown.length; k++) shownCount += shown[k]!;
  const marker = trace['marker'] as { size?: unknown } | undefined;
  const side = trace['side'];
  return {
    pos: calc.pos,
    width: num(trace['width'], 0),
    num: num(trace[TRACE_KEYS.num], 0),
    offsetIndex: num(trace[TRACE_KEYS.offsetIndex], 0),
    offsetGroups: groups?.[key]?.length ?? 0,
    side: side === 'positive' || side === 'negative' ? side : 'both',
    hasPoints: calc.mode !== false && shownCount > 0,
    pointpos: num(trace['pointpos'], 0),
    jitter: num(trace['jitter'], 0),
    markerSize: num(marker?.size, 6),
  };
}

/**
 * Place the drawn points (Plotly's `plotPoints`): `pos + bPos + bdPos · (pointpos + jitter)`, the
 * jitter drawn from Plotly's generator reseeded for the trace, box by box.
 */
export function placePoints(calc: BoxCalc, trace: FullTrace): void {
  const { samples, stats, offsets } = calc;
  const out = new Float64Array(samples.value.length).fill(NaN);
  if (calc.mode) {
    const jitter = num(trace['jitter'], 0);
    const pointpos = num(trace['pointpos'], 0);
    const rand = pseudoRandom();
    for (let b = 0; b < calc.count; b++) {
      const from = samples.start[b]!;
      const to = samples.start[b + 1]!;
      const ks: number[] = [];
      for (let k = from; k < to; k++) if (samples.shown[k]) ks.push(k);
      const vals = Float64Array.from(ks, (k) => samples.value[k]!);
      const off = jitterOffsets(
        vals,
        {
          min: stats.min[b]!,
          max: stats.max[b]!,
          q1: stats.q1[b]!,
          q3: stats.q3[b]!,
          lowerFence: stats.lf[b]!,
          upperFence: stats.uf[b]!,
        },
        jitter,
        calc.mode !== 'all',
        rand,
      );
      const center = calc.pos[b]! + offsets.bPos;
      ks.forEach((k, j) => {
        out[k] = center + offsets.bdPos * (pointpos + off[j]!);
      });
    }
  }
  calc.pointPos = out;
}

/**
 * Lay out a group of box (or violin) calcs sharing a subplot and orientation, then place their
 * points.
 */
export function layoutBoxes(
  entries: readonly { calc: BoxCalc; trace: FullTrace }[],
  fullLayout: FullLayout,
): void {
  if (entries.length === 0) return;
  const first = entries[0]!.calc;
  const outputs = layoutOffsets(
    entries.map((e) => offsetInput(e.calc, e.trace, fullLayout)),
    offsetOptions(fullLayout, first.kind, first.posType),
  );
  entries.forEach((e, i) => {
    e.calc.offsets = outputs[i]!;
    placePoints(e.calc, e.trace);
  });
}

/** Box calc: statistics per position, laid out as if the trace were alone. */
export function calcBox(trace: FullTrace, ctx: CalcContext): BoxCalc {
  const calc = calcBoxSamples(trace, ctx, 'box');
  layoutBoxes([{ calc, trace }], ctx.fullLayout);
  return calc;
}

/** Cross-trace calc: lay out every box (or violin) trace of one subplot together, per orientation. */
export function crossTraceCalcBox(
  entries: readonly CrossTraceEntry<BoxCalc>[],
  ctx: CrossTraceContext,
): void {
  for (const orientation of ['v', 'h'] as const) {
    const group = entries.filter(
      (e) => e.calc && e.calc.orientation === orientation && e.calc.count > 0,
    );
    layoutBoxes(group, ctx.fullLayout);
  }
}

/** Value-axis extremes from a calc-space range (Plotly: `findExtremes(valAxis, …, {padded})`). */
export function valueExtremes(
  lo: number,
  hi: number,
  scale: Scale | undefined,
  type: AxisType | undefined,
): AxisExtremes {
  if (!(lo <= hi)) return { min: [], max: [] };
  if (scale && type !== 'category' && type !== 'multicategory') {
    return findExtremes(scale, [lo, hi], { padded: true });
  }
  const l0 = calcToLinear(type, lo);
  const l1 = calcToLinear(type, hi);
  return {
    min: [{ l: l0, padPx: 0, extrapad: true }],
    max: [{ l: l1, padPx: 0, extrapad: true }],
  };
}

/** Autorange extremes of a box trace. */
export function boxExtremes(calc: BoxCalc, _trace: FullTrace, ctx: CalcContext): TraceExtremes {
  const va = boxAxes(calc.orientation, ctx.xaxis, ctx.yaxis)[1];
  const [lo, hi] = calc.valueRange;
  const value = valueExtremes(lo, hi, va?.scale, calc.valType);
  const pos = calc.offsets.extremes;
  return calc.orientation === 'h' ? { x: value, y: pos } : { x: pos, y: value };
}

/**
 * Samples for value-based `categoryorder`s on the position axis (E3.6: `median ascending`, …):
 * each sample's box position and value.
 */
export function boxCategoryValues(
  calc: BoxCalc,
  _trace: FullTrace,
  axis: 'x' | 'y',
): CategorySamples | undefined {
  if ((calc.orientation === 'h' ? 'y' : 'x') !== axis) return undefined;
  const { samples } = calc;
  const index = new Float64Array(samples.value.length);
  for (let b = 0; b < calc.count; b++) {
    index.fill(calc.pos[b]!, samples.start[b]!, samples.start[b + 1]!);
  }
  return { index, value: samples.value };
}
