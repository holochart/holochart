/**
 * Shared 1D binning (plan E10.1, E10.2): a port of plotly.js' histogram binning, used by
 * `histogram` and by the 2D histograms (`histogram2d`, `histogram2dcontour`) once per direction.
 * Pure: no renderer, no chart state.
 *
 * ## Spaces
 *
 * Everything here works in **calc space** of the binned axis (Plotly's `c`): numbers on linear
 * axes, ms since the epoch on date axes, category indices on category axes, and the *raw* data
 * values on log axes (Plotly bins log axes linearly in data units). {@link binAxis} converts data
 * and `xbins.start` / `end` values (range units: exponents on log axes) into it.
 *
 * ## Pieces, in the order a trace uses them
 *
 * 1. Layout defaults: {@link supplyBinGroups} (Plotly's `crossTraceDefaults`) groups every
 *    histogram-like trace of the figure (1D in its orientation's direction, 2D in both) into
 *    **bin groups** that share one bin spec: `bingroup` (`xbingroup` / `ybingroup` for 2D), and
 *    under `barmode` `stack` / `group` every 1D histogram of a subplot and orientation.
 * 2. Calc: {@link resolveBins} (Plotly's `calcAllAutoBins`) auto-bins the whole group
 *    ({@link autoBin}, cached per group and axis) and returns this trace's spec and its samples in
 *    calc space; {@link makeBins} lays the edges out and finds each sample's bin.
 * 3. Aggregation: {@link BIN_FUNCTIONS} (`histfunc`), {@link averageBins}, {@link normalizeBins}
 *    (`histnorm`) and {@link accumulateBins} (`cumulative`).
 * 4. Hover: {@link binLabelRounder} (Plotly's `getBinSpanLabelRound`) rounds bin edges to the
 *    labels Plotly shows (`0 - 4` for integer data in bins of 5).
 *
 * Month bins (`'M1'`, `'M3'`, `'M12'`…) are not uniform: {@link makeBins} lists their edges and
 * searches them.
 */
import {
  autoTicks,
  cleanNumber,
  dateToMs,
  formatDate,
  isArrayLike,
  parseDtick,
  roundUp,
  type AxisType,
  type Dtick,
  type FullLayout,
  type FullTrace,
  type Scale,
} from '@mk7s/holochart-core';

const ONESEC = 1000;
const ONEMIN = 60 * ONESEC;
const ONEHOUR = 60 * ONEMIN;
const HALFDAY = 12 * ONEHOUR;
const ONEDAY = 24 * ONEHOUR;
const THREEDAYS = 3 * ONEDAY;
const ONEAVGYEAR = 365.25 * ONEDAY;
const ONEAVGMONTH = ONEAVGYEAR / 12;
/** 2000-01-01, Plotly's default date `tick0`. */
const EPOCH_2000 = 946_684_800_000;
/** Plotly treats more bins than this as an error and stops there. */
export const MAX_BINS = 1e6;
/** Plotly's `findBin` rounding tolerance, in bins. */
const ROUNDING_ERROR = 1e-9;

// ---- Bin specs ----------------------------------------------------------------------------------

/**
 * A bin size: a positive number in calc units (ms on date axes, whole categories on category
 * axes) or, on date axes, a month step `'M<n>'` (`'M1'` months, `'M3'` quarters, `'M12'` years).
 */
export type BinSize = Dtick;

/** Bins `[start, start + size)`, `[start + size, …)` up to `end`, in calc space. */
export interface BinSpec {
  /** First bin edge. */
  readonly start: number;
  /**
   * Where binning stops: the last bin is the one that starts before `end` (it may end past it,
   * Plotly semantics).
   */
  readonly end: number;
  readonly size: BinSize;
}

/** Result of {@link autoBin}: the spec plus the data span it was computed from. */
export interface AutoBinResult extends BinSpec {
  /** `max - min` of the finite data (Plotly's `_dataSpan`); 0 for one distinct value. */
  readonly dataSpan: number;
}

/** Options of {@link autoBin}. */
export interface AutoBinOptions {
  /**
   * `nbinsx` / `nbinsy`: the maximum number of bins wanted; the size is the next "nice" step at
   * or above `(max - min) / nbins`. 0 or unset: fully automatic.
   */
  readonly nbins?: number;
  /** An explicit `xbins.size` (cleaned for the axis type): only the start is automatic then. */
  readonly size?: unknown;
  /** 2D histograms scale the automatic size with `n^0.25` instead of `n^0.4`. */
  readonly is2d?: boolean;
}

/**
 * A valid bin size for an axis type (Plotly's `cleanTicks.dtick`), or `undefined`: a positive
 * number, or `'M<n>'` on date axes; category sizes are rounded to whole categories (at least 1).
 */
export function cleanBinSize(size: unknown, axisType: AxisType): BinSize | undefined {
  return parseDtick(size, axisType === 'log' ? 'linear' : axisType);
}

/** Plotly's `Lib.increment`: `x + delta` in integer steps, with float noise rounded away. */
function incrementNumeric(x: number, delta: number): number {
  if (!delta) return x;
  const scale = 1 / Math.abs(delta);
  let next = scale > 1 ? (scale * x + scale * delta) / scale : x + delta;
  const len = String(next).length;
  if (len > 16 && len >= String(x).length + String(delta).length) {
    const s = next.toPrecision(12);
    if (!s.includes('e+')) next = Number(s);
  }
  return next;
}

/**
 * Plotly's `Lib.incrementMonth`: add calendar months (UTC), keeping the time of day. The date is
 * moved 3 days forward first, so month ends map to month ends (Nov 30 + 1 month → Dec 31 12:00
 * stays a month apart from Jan 31): month bins shifted off the 1st keep their shape.
 */
function incrementMonth(ms: number, months: number): number {
  const time = ((ms % ONEDAY) + ONEDAY) % ONEDAY;
  const d = new Date(Math.round(ms - time) + THREEDAYS);
  return d.setUTCMonth(d.getUTCMonth() + months) + time - THREEDAYS;
}

/**
 * The next bin edge after `v` (before it with `reverse`), Plotly's `tickIncrement` for bins:
 * numbers step without float noise, `'M<n>'` steps calendar months keeping the time of day.
 * NaN for an invalid size.
 */
export function binIncrement(v: number, size: BinSize, reverse = false): number {
  const sign = reverse ? -1 : 1;
  if (typeof size === 'number') return incrementNumeric(v, sign * size);
  const n = Number(size.slice(1));
  return size.charAt(0) === 'M' && Number.isFinite(n) ? incrementMonth(v, sign * n) : NaN;
}

/**
 * Plotly's `tickFirst` for bins: the first edge of the grid `tick0 + k·size` at or after the
 * start of `range` (less 0.01% of the range, against rounding).
 */
function firstEdge(size: BinSize, tick0: number, range: readonly [number, number]): number {
  const reversed = range[1] < range[0];
  const r0 = range[0] - (range[1] - range[0]) * 1e-4;
  if (typeof size === 'number') {
    return (reversed ? Math.floor : Math.ceil)((r0 - tick0) / size) * size + tick0;
  }
  const n = Number(size.slice(1));
  let t0 = tick0;
  for (let cnt = 0; cnt < 10; cnt++) {
    const t1 = binIncrement(t0, size, reversed);
    if ((t1 - r0) * (t0 - r0) <= 0) return reversed ? Math.min(t0, t1) : Math.max(t0, t1);
    const mult = (r0 - (t0 + t1) / 2) / (t1 - t0);
    const jump: BinSize = `M${(Math.abs(Math.round(mult)) || 1) * n}`;
    t0 = binIncrement(t0, jump, mult < 0 ? !reversed : reversed);
  }
  return t0;
}

/** Plotly's `Lib.distinctVals` on finite values: sorted distinct values and their smallest gap. */
function distinctValues(values: ArrayLike<number>): { values: number[]; minDiff: number } {
  const sorted = Float64Array.from(values).filter(Number.isFinite).sort();
  if (sorted.length === 0) return { values: [], minDiff: 1 };
  const last = sorted.length - 1;
  let minDiff = sorted[last]! - sorted[0]! || 1;
  const errDiff = minDiff / (last || 1) / 10000;
  const out = [sorted[0]!];
  let prev = sorted[0]!;
  for (let i = 1; i <= last; i++) {
    const v = sorted[i]!;
    const diff = v - prev;
    if (diff > errDiff) {
      minDiff = Math.min(minDiff, diff);
      out.push(v);
      prev = v;
    }
  }
  return { values: out, minDiff };
}

/** Min, max, population standard deviation and count of the finite values. */
function stats(data: ArrayLike<number>): { min: number; max: number; stdev: number; n: number } {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i]!;
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    n++;
  }
  const mean = n ? sum / n : NaN;
  let sq = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i]!;
    if (Number.isFinite(v)) sq += (v - mean) ** 2;
  }
  return { min, max, stdev: n ? Math.sqrt(sq / n) : NaN, n };
}

/**
 * Plotly's `autoShiftNumericBins`: move the start off data sitting on bin edges — half a unit
 * down for all-integer data (so integers never sit on an edge), half a bin when many points sit
 * on edges and few in the middle.
 */
function shiftNumericBins(
  binStart: number,
  data: ArrayLike<number>,
  dtick: number,
  type: AxisType,
  dataMin: number,
  dataMax: number,
): number {
  let edgecount = 0;
  let midcount = 0;
  let intcount = 0;
  let blankCount = 0;
  // Within 1% of a bin edge (JS `%`, negative offsets count as near, as in Plotly).
  const nearEdge = (v: number): boolean => (1 + ((v - binStart) * 100) / dtick) % 100 < 2;
  for (let i = 0; i < data.length; i++) {
    const v = data[i]!;
    if (v % 1 === 0) intcount++;
    else if (!Number.isFinite(v)) blankCount++;
    if (nearEdge(v)) edgecount++;
    if (nearEdge(v + dtick / 2)) midcount++;
  }
  const dataCount = data.length - blankCount;
  if (intcount === dataCount && type !== 'date') {
    if (dtick < 1) return dataMin - 0.5 * dtick;
    let start = binStart - 0.5;
    if (start + dtick < dataMin) start += dtick;
    return start;
  }
  if (midcount < dataCount * 0.1) {
    if (edgecount > dataCount * 0.3 || nearEdge(dataMin) || nearEdge(dataMax)) {
      const shift = dtick / 2;
      return binStart + (binStart + shift < dataMin ? shift : -shift);
    }
  }
  return binStart;
}

/** Plotly's `findExactDates`: fractions of the data on whole years, months (incl.) and days (incl.). */
function exactDates(data: ArrayLike<number>): { years: number; months: number; days: number } {
  let years = 0;
  let months = 0;
  let days = 0;
  let blank = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i]!;
    if (!Number.isFinite(v)) {
      blank++;
      continue;
    }
    if (v % ONEDAY) continue;
    const d = new Date(v);
    if (d.getUTCDate() === 1) {
      if (d.getUTCMonth() === 0) years++;
      else months++;
    } else days++;
  }
  months += years;
  days += months;
  const count = data.length - blank;
  return { years: years / count, months: months / count, days: days / count };
}

/**
 * Plotly's `autoShiftMonthBins`: when most dates are whole days, move month bins so whole
 * years / months / days fall near bin centers.
 */
function shiftMonthBins(
  binStart: number,
  data: ArrayLike<number>,
  dtick: string,
  dataMin: number,
): number {
  const exact = exactDates(data);
  const threshold = 0.8;
  if (!(exact.days > threshold)) return binStart;
  const months = Number(dtick.slice(1));
  let start: number;
  if (exact.years > threshold && months % 12 === 0) {
    // The middle of a non-leap year is 1.5 days into July.
    start = binIncrement(binStart, 'M6', true) + ONEDAY * 1.5;
  } else if (exact.months > threshold) {
    // Half the longest month: 31-day months are labelled exactly.
    start = binIncrement(binStart, 'M1', true) + ONEDAY * 15.5;
  } else {
    start = binStart - HALFDAY;
  }
  const next = binIncrement(start, dtick);
  return next <= dataMin ? next : start;
}

/**
 * Plotly's `Axes.autoBin`: "nice" bins for `data` (calc space) on an axis of `axisType`.
 *
 * - Categories: one bin per category (or `size` categories), from `min - 0.5` to `max + 0.5`.
 * - Numbers: the size is the next 1/2/5×10ⁿ step at or above `2·σ / n^0.4` (`n^0.25` for 2D),
 *   but not below the rounded-down smallest gap between distinct values; with `nbins`, at or above
 *   `(max - min) / nbins`. Bins start on a multiple of the size, shifted off the data
 *   ({@link AutoBinResult}: e.g. integers get edges at `k + 0.5`).
 * - Dates: sizes are ms up to days, then months and years (`'M1'`, `'M3'`, `'M12'`…); day and
 *   week bins start on Sundays; month bins shift so whole dates sit mid-bin.
 * - Log axes are binned linearly in data units.
 *
 * `data` may hold NaN for unusable samples (they count in `n`, as in Plotly). Without finite
 * data, `start` and `end` are NaN (no bins).
 *
 * @example
 * ```ts
 * autoBin([1, 2, 2, 3, 3, 3, 4, 4, 5], 'linear'); // { start: 0.5, end: 5.5, size: 1, dataSpan: 4 }
 * autoBin(ms, 'date', { size: 'M1' });             // month bins
 * ```
 */
export function autoBin(
  data: ArrayLike<number>,
  axisType: AxisType,
  options: AutoBinOptions = {},
): AutoBinResult {
  const { min: dataMin, max: dataMax, stdev } = stats(data);
  if (!(dataMin <= dataMax)) return { start: NaN, end: NaN, size: 1, dataSpan: 0 };
  const dataSpan = dataMax - dataMin;
  if (axisType === 'category' || axisType === 'multicategory') {
    const n = cleanNumber(options.size);
    return {
      start: dataMin - 0.5,
      end: dataMax + 0.5,
      size: Math.max(1, Math.round(n) || 1),
      dataSpan,
    };
  }
  const type: AxisType = axisType === 'log' ? 'linear' : axisType;
  const cleaned = options.size !== undefined ? cleanBinSize(options.size, type) : undefined;
  let dtick: Dtick;
  let tick0: number;
  if (cleaned !== undefined) {
    dtick = cleaned;
    tick0 = type === 'date' ? EPOCH_2000 : 0;
  } else {
    let size0: number;
    if (options.nbins) size0 = dataSpan / options.nbins;
    else {
      const distinct = distinctValues(data);
      const msexp = Math.pow(10, Math.floor(Math.log(distinct.minDiff) / Math.LN10));
      const minSize = msexp * roundUp(distinct.minDiff / msexp, [0.9, 1.9, 4.9, 9.9], true);
      size0 = Math.max(minSize, (2 * stdev) / Math.pow(data.length, options.is2d ? 0.25 : 0.4));
      if (!Number.isFinite(size0)) size0 = 1;
    }
    const ticks = autoTicks(type, size0);
    dtick = ticks.dtick;
    tick0 = ticks.tick0;
  }
  const first = firstEdge(dtick, tick0, [dataMin, dataMax]);
  let binStart = binIncrement(first, dtick, true);
  let binEnd: number;
  if (typeof dtick === 'number') {
    binStart = shiftNumericBins(binStart, data, dtick, type, dataMin, dataMax);
    const count = 1 + Math.floor((dataMax - binStart) / dtick);
    binEnd = binStart + count * dtick;
  } else {
    if (dtick.charAt(0) === 'M') binStart = shiftMonthBins(binStart, data, dtick, dataMin);
    binEnd = binStart;
    for (let guard = 0; binEnd <= dataMax && guard < MAX_BINS; guard++) {
      const next = binIncrement(binEnd, dtick);
      if (!(next > binEnd)) break;
      binEnd = next;
    }
  }
  return { start: binStart, end: binEnd, size: dtick, dataSpan };
}

// ---- Bin layout ---------------------------------------------------------------------------------

/** Bin edges of a spec and the bin lookup (see {@link makeBins}). */
export interface Bins {
  /** `count + 1` edges, ascending (calc space). */
  readonly edges: Float64Array;
  readonly count: number;
  /** Whether every bin has the same width (numeric sizes): lookups are O(1). */
  readonly uniform: boolean;
  /**
   * The bin of a calc value: `0 … count - 1`, or an index outside that range (negative, or
   * `count` and up) for values outside the bins. NaN gives -1.
   */
  find(v: number): number;
}

/**
 * Lay out the bins of a spec (Plotly's histogram calc loop): edges from `start` by `size` while
 * the edge is below `end` (less a millionth of a bin, against rounding), at most {@link MAX_BINS}.
 * Values are found with Plotly's `findBin` (a 1e-9-bin tolerance, so a value on an edge falls in
 * the bin that starts there).
 */
export function makeBins(spec: BinSpec): Bins {
  const { start, size } = spec;
  const edges: number[] = [];
  let i = start;
  const end = spec.end + (i - binIncrement(i, size)) / 1e6;
  while (i < end && edges.length < MAX_BINS) {
    const i2 = binIncrement(i, size);
    edges.push(i);
    if (i2 <= i) break;
    i = i2;
  }
  edges.push(i);
  const out = Float64Array.from(edges);
  const count = out.length - 1;
  if (typeof size === 'number') {
    return {
      edges: out,
      count,
      uniform: true,
      find: (v) => (Number.isFinite(v) ? Math.floor((v - start) / size + ROUNDING_ERROR) : -1),
    };
  }
  return { edges: out, count, uniform: false, find: (v) => findEdge(out, v) };
}

/** Plotly's `findBin` over an edge list (binary search, `<=` with a relative tolerance). */
function findEdge(edges: Float64Array, value: number): number {
  if (!Number.isFinite(value)) return -1;
  let n1 = 0;
  let n2 = edges.length;
  const step = n2 > 1 ? (edges[n2 - 1]! - edges[0]!) / (n2 - 1) : 1;
  const ascending = step >= 0;
  const v = value + step * ROUNDING_ERROR * (ascending ? 1 : -1);
  for (let c = 0; n1 < n2 && c < 100; c++) {
    const n = Math.floor((n1 + n2) / 2);
    const e = edges[n]!;
    if (ascending ? e <= v : e > v) n1 = n + 1;
    else n2 = n;
  }
  return n1 - 1;
}

// ---- Aggregation (histfunc, histnorm, cumulative) ------------------------------------------------

/** `histfunc` values. */
export type HistFunc = 'count' | 'sum' | 'avg' | 'min' | 'max';
/** `histnorm` values. */
export type HistNorm = '' | 'percent' | 'probability' | 'density' | 'probability density';

/**
 * Plotly's bin functions: add sample `i` (its aggregated value `values[i]`) to bin `n` of `size`
 * and return what it adds to the total (for `percent` / `probability`). `count` ignores `values`;
 * `avg` also counts per bin (`counts`), then {@link averageBins} divides. `min` / `max` bins
 * start as NaN (empty).
 */
export const BIN_FUNCTIONS: Readonly<
  Record<
    HistFunc,
    (
      n: number,
      i: number,
      size: Float64Array,
      values: ArrayLike<unknown> | undefined,
      counts: Float64Array | undefined,
    ) => number
  >
> = {
  count: (n, _i, size) => {
    size[n]!++;
    return 1;
  },
  sum: (n, i, size, values) => {
    const v = cleanNumber(values?.[i]);
    if (!Number.isFinite(v)) return 0;
    size[n]! += v;
    return v;
  },
  avg: (n, i, size, values, counts) => {
    const v = cleanNumber(values?.[i]);
    if (Number.isFinite(v)) {
      size[n]! += v;
      if (counts) counts[n]!++;
    }
    return 0;
  },
  min: (n, i, size, values) => extreme(n, cleanNumber(values?.[i]), size, (a, b) => a > b),
  max: (n, i, size, values) => extreme(n, cleanNumber(values?.[i]), size, (a, b) => a < b),
};

function extreme(
  n: number,
  v: number,
  size: Float64Array,
  replaces: (current: number, v: number) => boolean,
): number {
  if (!Number.isFinite(v)) return 0;
  const current = size[n]!;
  if (!Number.isFinite(current)) {
    size[n] = v;
    return v;
  }
  if (replaces(current, v)) {
    size[n] = v;
    return v - current;
  }
  return 0;
}

/** The initial value of every bin for a `histfunc`: NaN (empty) for `min` / `max`, else 0. */
export function initialBinValue(func: HistFunc): number {
  return func === 'min' || func === 'max' ? NaN : 0;
}

/**
 * Plotly's `doAvg`: divide each bin's sum by its sample count (empty bins become NaN). Returns
 * the sum of the averages, the total that `percent` / `probability` normalize by.
 */
export function averageBins(size: Float64Array, counts: ArrayLike<number>): number {
  let total = 0;
  for (let i = 0; i < size.length; i++) {
    const c = counts[i]!;
    if (c) {
      size[i]! /= c;
      total += size[i]!;
    } else size[i] = NaN;
  }
  return total;
}

/**
 * `histnorm` in place (Plotly's norm functions): `percent` / `probability` divide by `total`
 * (empty `avg` / `min` / `max` bins become 0 first, as in Plotly)
 * (×100); `density` multiplies by `inc` (1 / bin width, per bin, in calc units: 1/ms on date
 * axes), `probability density` by `inc / total`. `yinc` is the other direction's 1 / bin width
 * of 2D histograms.
 */
export function normalizeBins(
  size: Float64Array,
  norm: HistNorm,
  total: number,
  inc: ArrayLike<number>,
  yinc?: number,
): void {
  const n = size.length;
  // Empty `avg` / `min` / `max` bins (NaN, Plotly's null) normalize to 0, as `null * k` does.
  if (norm) for (let i = 0; i < n; i++) if (Number.isNaN(size[i]!)) size[i] = 0;
  switch (norm) {
    case 'percent': {
      const k = 100 / total;
      for (let i = 0; i < n; i++) size[i]! *= k;
      return;
    }
    case 'probability':
      for (let i = 0; i < n; i++) size[i]! /= total;
      return;
    case 'density': {
      const k = yinc || 1;
      for (let i = 0; i < n; i++) size[i]! *= inc[i]! * k;
      return;
    }
    case 'probability density': {
      const t = yinc ? total / yinc : total;
      for (let i = 0; i < n; i++) size[i]! *= inc[i]! / t;
      return;
    }
    default:
  }
}

/**
 * `cumulative` in place (Plotly's `cdf`): running sums `increasing` (left to right) or
 * `decreasing`; `currentbin: 'exclude'` shifts them one bin (the current bin is not counted),
 * `'half'` counts half of it.
 */
export function accumulateBins(
  size: Float64Array,
  direction: 'increasing' | 'decreasing',
  currentbin: 'include' | 'exclude' | 'half',
): void {
  const n = size.length;
  if (n === 0) return;
  // Empty bins (NaN, Plotly's null) add nothing (`null + v === v`); with `include`, the first
  // bin of the running sum is never written and stays empty, as in Plotly.
  const firstIndex = direction === 'increasing' ? 0 : n - 1;
  const keepEmpty = currentbin === 'include' && Number.isNaN(size[firstIndex]!);
  for (let i = 0; i < n; i++) if (Number.isNaN(size[i]!)) size[i] = 0;
  if (keepEmpty) size[firstIndex] = NaN;
  if (currentbin === 'half') {
    const order = (k: number): number => (direction === 'increasing' ? k : n - 1 - k);
    let prev = size[order(0)]!;
    size[order(0)]! /= 2;
    for (let k = 1; k < n; k++) {
      const i = order(k);
      const v = size[i]!;
      size[i] = prev + v / 2;
      prev += v;
    }
    return;
  }
  const at = (i: number): number => (Number.isNaN(size[i]!) ? 0 : size[i]!);
  if (direction === 'increasing') {
    for (let i = 1; i < n; i++) size[i]! += at(i - 1);
    if (currentbin === 'exclude') {
      size.copyWithin(1, 0, n - 1);
      size[0] = 0;
    }
  } else {
    for (let i = n - 2; i >= 0; i--) size[i]! += at(i + 1);
    if (currentbin === 'exclude') {
      size.copyWithin(0, 1);
      size[n - 1] = 0;
    }
  }
}

// ---- Hover labels ------------------------------------------------------------------------------

/** The date part `YYYY-MM-DD` of a calc value (Plotly's `c2d(v, ONEAVGYEAR)`). */
function dateOnly(v: number): string {
  const s = formatDate(v);
  return s === undefined ? '' : s.split(' ')[0]!;
}

function dateParts(v: number): string[] {
  const parts = dateOnly(v).split('-');
  if (parts[0] === '') parts[0] = `-${parts.splice(1, 1)[0] ?? ''}`;
  return parts;
}

/** Largest digit (or date unit) that changes anywhere in a region of width `dv`. */
function guaranteedDigit(dv: number, isDate: boolean): number {
  if (isDate && dv > ONESEC) {
    if (dv > ONEDAY) {
      if (dv > ONEAVGYEAR * 1.1) return ONEAVGYEAR;
      if (dv > ONEAVGMONTH * 1.1) return ONEAVGMONTH;
      return ONEDAY;
    }
    if (dv > ONEHOUR) return ONEHOUR;
    if (dv > ONEMIN) return ONEMIN;
    return ONESEC;
  }
  return Math.pow(10, Math.floor(Math.log(dv) / Math.LN10));
}

function digitChanged(digit: number, v1: number, v2: number, isDate: boolean): boolean {
  if (isDate && digit > ONEDAY) {
    const k = digit === ONEAVGYEAR ? 0 : 1;
    return dateParts(v1)[k] !== dateParts(v2)[k];
  }
  return Math.floor(v2 / digit) - Math.floor(v1 / digit) > 0.1;
}

/** Plotly's `biggestDigitChanged`: the largest digit that changes within `[v1, v2]`. */
function biggestDigitChanged(v1: number, v2: number, isDate: boolean): number {
  if (v1 * v2 <= 0) return Infinity;
  let digit = guaranteedDigit(Math.abs(v2 - v1), isDate);
  for (let i = 0; i < 10; i++) {
    const next = guaranteedDigit(digit * 80, isDate);
    if (digit === next) break;
    if (digitChanged(next, v1, v2, isDate)) digit = next;
    else break;
  }
  return digit;
}

/**
 * Plotly's `getBinSpanLabelRound`: a function rounding a bin edge to the value its hover label
 * shows, given how close the data come to the bin edges (`leftGap`: smallest distance from a
 * bin's start to a sample in it, `rightGap`: from a sample to its bin's end, over the whole bin
 * group). Right edges back off one digit when that keeps the labels unambiguous, so integer data
 * in bins `[-0.5, 4.5)` reads `0 - 4`, and month bins shifted half a day read whole months
 * (`Jan 1, 2024 - Jan 31, 2024`).
 *
 * Use it only when some bin holds different values; bins with one distinct value label that
 * value (Plotly).
 *
 * @param edges - At least the first two bin edges (calc space).
 * @returns `(edge, isRightEdge) => rounded` in calc space.
 */
export function binLabelRounder(
  leftGap: number,
  rightGap: number,
  edges: ArrayLike<number>,
  axisType: AxisType,
): (v: number, isRightEdge?: boolean) => number {
  const isDate = axisType === 'date';
  const dv0 = -1.1 * rightGap;
  const dv1 = -0.1 * rightGap;
  const dv2 = leftGap - dv1;
  const edge0 = edges[0]!;
  const edge1 = edges.length > 1 ? edges[1]! : edge0;
  const leftDigit = Math.min(
    biggestDigitChanged(edge0 + dv1, edge0 + dv2, isDate),
    biggestDigitChanged(edge1 + dv1, edge1 + dv2, isDate),
  );
  const rightDigit = Math.min(
    biggestDigitChanged(edge0 + dv0, edge0 + dv1, isDate),
    biggestDigitChanged(edge1 + dv0, edge1 + dv1, isDate),
  );
  let digit: number;
  let disambiguate: boolean;
  if (leftDigit > rightDigit && rightDigit < Math.abs(edge1 - edge0) / 4000) {
    digit = leftDigit;
    disambiguate = false;
  } else {
    digit = Math.min(leftDigit, rightDigit);
    disambiguate = true;
  }

  if (isDate && digit > ONEDAY) {
    const dashExclude = digit === ONEAVGYEAR ? 1 : 6;
    const increment = digit === ONEAVGYEAR ? 'M12' : 'M1';
    return (v, isRightEdge) => {
      let s = dateOnly(v);
      const dash = s.indexOf('-', dashExclude);
      if (dash > 0) s = s.slice(0, dash);
      let rounded = dateToMs(s);
      if (rounded < v) {
        const next = binIncrement(rounded, increment);
        if ((rounded + next) / 2 < v + leftGap) rounded = next;
      }
      return isRightEdge && disambiguate ? binIncrement(rounded, increment, true) : rounded;
    };
  }
  return (v, isRightEdge) => {
    let rounded = digit * Math.round(v / digit);
    if (rounded + digit / 10 < v && rounded + digit * 0.9 < v + leftGap) rounded += digit;
    if (isRightEdge && disambiguate) rounded -= digit;
    return rounded;
  };
}

// ---- Axis conversion ----------------------------------------------------------------------------

/** How a binned axis converts data and bin bounds into calc space (see the module comment). */
export interface BinAxis {
  readonly type: AxisType;
  /**
   * Identity of the conversion (the scale): bin groups cache their automatic bins per key, so a
   * rebuilt scale (new category order) rebins. Default: the axis type.
   */
  readonly key?: unknown;
  /** Data values → calc space (NaN where unusable). */
  d2c(values: ArrayLike<unknown>): Float64Array;
  /**
   * A `xbins.start` / `end` value → calc space, or NaN: dates (strings, ms, `Date`) on date
   * axes, exponents on log axes (range units, Plotly), numbers otherwise (category bounds are
   * category indices, e.g. `-0.5`).
   */
  r2c(v: unknown): number;
}

/** A {@link BinAxis} for an axis' scale (a runtime `AxisInfo.scale`). */
export function binAxis(scale: Scale): BinAxis {
  const type = scale.type;
  return {
    type,
    key: scale,
    d2c(values) {
      if (type === 'log')
        return Float64Array.from({ length: values.length }, (_, i) => cleanNumber(values[i]));
      return scale.d2lArray(values);
    },
    r2c(v) {
      if (v === undefined || v === null || v === '') return NaN;
      if (type === 'date') return dateToMs(v);
      const n = cleanNumber(v);
      return type === 'log' ? Math.pow(10, n) : n;
    },
  };
}

// ---- Bin groups ---------------------------------------------------------------------------------

/** Private `fullLayout` key of the bin groups (Plotly's `_histogramBinOpts`). */
export const BIN_GROUPS_KEY = '_histogramBinOpts';

/** A binned direction of a trace. */
export type BinDir = 'x' | 'y';

/**
 * Traces sharing one bin spec in one direction (Plotly's `binOpts`). Group-level settings come
 * from the first member that sets them in its input (`xbins.start`, …, `nbinsx`), as in Plotly.
 */
export interface BinGroup {
  readonly name: string;
  /** Members in trace order, with the direction each is binned in. */
  readonly traces: FullTrace[];
  readonly dirs: BinDir[];
  start?: unknown;
  startFound?: boolean;
  end?: unknown;
  endFound?: boolean;
  size?: unknown;
  sizeFound?: boolean;
  /** `nbinsx` / `nbinsy` of the first member that sets it (else the first member's, 0). */
  nbins?: number;
  nbinsFound?: boolean;
}

/** Whether a trace is binned (Plotly's `histogram` category): its module lists `'histogram'`. */
export function isHistogramLike(trace: FullTrace): boolean {
  return trace._module?.categories.includes('histogram') === true;
}

/** Whether a trace is a 2D histogram (Plotly's `2dMap`): its module lists `'2dMap'`. */
export function is2dHistogram(trace: FullTrace): boolean {
  return trace._module?.categories.includes('2dMap') === true;
}

/** The direction a 1D histogram bins in: `x` for vertical bars, `y` for horizontal ones. */
export function binDirOf(trace: FullTrace): BinDir {
  return trace['orientation'] === 'h' ? 'y' : 'x';
}

/** Private key of a trace's bin group name in a direction (`_xbingroup`, Plotly). */
export function binGroupKey(dir: BinDir): string {
  return `_${dir}bingroup`;
}

/** An input bin attribute of a trace, ignoring `xbins` when the trace says `autobinx: true`. */
function inputBinValue(
  trace: FullTrace,
  dir: BinDir,
  attr: 'start' | 'end' | 'size' | 'nbins',
): unknown {
  const input = trace._input;
  if (attr === 'nbins') return input[`nbins${dir}`];
  // Plotly's `cleanData`: `autobinx: true` drops `xbins` (one-time autobinning, obsolete).
  if (input[`autobin${dir}`] === true) return undefined;
  const bins = input[`${dir}bins`];
  return bins !== null && typeof bins === 'object'
    ? (bins as Record<string, unknown>)[attr]
    : undefined;
}

/**
 * Group every histogram-like trace into bin groups (Plotly's histogram `crossTraceDefaults`),
 * stored under {@link BIN_GROUPS_KEY} with each trace's group name under `_xbingroup` /
 * `_ybingroup`. Idempotent: every module with binned traces (histogram, histogram2d, …) calls it
 * from its layout defaults, after `barmode` is coerced; the last call wins with the same result.
 *
 * - Under `barmode` `stack` / `group` (not `overlay`), 1D histograms of one subplot and
 *   orientation **must match**: they share one group named by their first member's `bingroup`
 *   (written back to every member's `bingroup`), else by the subplot and direction. In `group`
 *   mode, histograms with an `alignmentgroup` match across subplots on their position axis.
 * - Other traces group by `bingroup` (2D histograms by `xbingroup` / `ybingroup`, defaulting to
 *   `bingroup + '__x'`); without one, each trace is its own group.
 *
 * Plotly also splits a group whose members sit on axes of different types; the axis types are
 * not known yet here, so {@link resolveBins} skips such members instead.
 */
export function supplyBinGroups(fullData: readonly FullTrace[], fullLayout: FullLayout): void {
  const groups: Record<string, BinGroup> = {};
  const barmode = fullLayout['barmode'];
  const binned = fullData.filter((t) => t.visible !== false && isHistogramLike(t));

  const fill = (trace: FullTrace, name: string, dir: BinDir): void => {
    const groupName = name || `\u0000${trace._index}__${dir}`;
    const group = (groups[groupName] ??= { name: groupName, traces: [], dirs: [] });
    group.traces.push(trace);
    group.dirs.push(dir);
    trace[binGroupKey(dir)] = groupName;
  };

  const mustMatch = new Map<string, FullTrace[]>();
  const others: FullTrace[] = [];
  for (const trace of binned) {
    let key = '';
    if (!is2dHistogram(trace)) {
      const dir = binDirOf(trace);
      const alignment = trace['alignmentgroup'];
      if (barmode === 'group' && typeof alignment === 'string' && alignment !== '') {
        key = `${String(trace[`${dir}axis`])}${String(trace['orientation'])}`;
      }
      if (!key && barmode !== 'overlay') {
        key = `${String(trace['xaxis'])}${String(trace['yaxis'])}${dir}`;
      }
    }
    if (key) {
      const list = mustMatch.get(key);
      if (list) list.push(trace);
      else mustMatch.set(key, [trace]);
    } else others.push(trace);
  }

  for (const [key, traces] of mustMatch) {
    if (traces.length === 1) {
      others.push(traces[0]!);
      continue;
    }
    const first = traces[0]!['bingroup'];
    const name = typeof first === 'string' && first !== '' ? first : key;
    for (const trace of traces) {
      trace['bingroup'] = name;
      fill(trace, name, binDirOf(trace));
    }
  }
  // Keep trace order within groups: must-match members came first above (Plotly does the same).
  for (const trace of others) {
    const bingroup = typeof trace['bingroup'] === 'string' ? trace['bingroup'] : '';
    if (is2dHistogram(trace)) {
      for (const dir of ['x', 'y'] as const) {
        const own = trace[`${dir}bingroup`];
        const name =
          typeof own === 'string' && own !== '' ? own : bingroup ? `${bingroup}__${dir}` : '';
        fill(trace, name, dir);
      }
    } else fill(trace, bingroup, binDirOf(trace));
  }

  for (const group of Object.values(groups)) {
    for (const attr of ['start', 'end', 'size', 'nbins'] as const) {
      if (attr === 'nbins' && group.sizeFound) continue;
      for (let i = 0; i < group.traces.length; i++) {
        const trace = group.traces[i]!;
        const dir = group.dirs[i]!;
        if (inputBinValue(trace, dir, attr) === undefined) continue;
        if (attr === 'nbins') {
          group.nbins = numberOr(trace[`nbins${dir}`], 0);
          group.nbinsFound = true;
        } else {
          group[attr] = (trace[`${dir}bins`] as Record<string, unknown> | undefined)?.[attr];
          group[`${attr}Found`] = true;
        }
        break;
      }
    }
    if (!group.sizeFound && !group.nbinsFound) {
      const first = group.traces[0]!;
      group.nbins = numberOr(first[`nbins${group.dirs[0]!}`], 0);
    }
  }
  fullLayout[BIN_GROUPS_KEY] = groups;
}

function numberOr(v: unknown, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

// ---- Resolving a trace's bins (calc) ------------------------------------------------------------

/** Options of {@link resolveBins}. */
export interface ResolveBinsOptions {
  /**
   * Every trace of the figure, for the single-valued overlay case (Plotly's
   * `handleSingleValueOverlays`): defaults to the traces of the bin groups.
   */
  readonly fullData?: readonly FullTrace[];
}

/** One trace's bins, from {@link resolveBins}. */
export interface ResolvedBins {
  /** This trace's spec: the group's, with its own `start` / `end` if it set them. */
  readonly spec: BinSpec;
  /** The group's spec (shared by every member; `start` / `end` may differ per trace). */
  readonly groupSpec: BinSpec;
  /** This trace's samples in calc space (NaN where unusable), index-aligned with its data. */
  readonly positions: Float64Array;
  /** The bin group's name. */
  readonly group: string;
  /**
   * Smallest distance from a bin's start to a sample in it, and from a sample to its bin's end,
   * over every member of the group (Plotly's shared `_roundFnOpts`), for {@link binLabelRounder}.
   */
  readonly gaps: { readonly left: number; readonly right: number };
}

interface GroupResult {
  spec: { start: number; end: number; size: BinSize };
  positions: Map<FullTrace, Float64Array>;
  gaps?: { left: number; right: number };
}

/** Group results per bin group object and axis (full layouts are rebuilt on every update). */
const CACHE = new WeakMap<BinGroup, Map<unknown, GroupResult>>();

function axisTypeOf(fullLayout: FullLayout, trace: FullTrace, dir: BinDir): unknown {
  const id = String(trace[`${dir}axis`] ?? dir);
  const name = `${id.charAt(0)}axis${id.slice(1)}`;
  return (fullLayout[name] as { type?: unknown } | undefined)?.type;
}

function dataOf(trace: FullTrace, dir: BinDir): ArrayLike<unknown> {
  const v = trace[dir];
  if (!isArrayLike(v)) return [];
  const n = typeof trace['_length'] === 'number' ? trace['_length'] : v.length;
  return v.length > n ? Array.prototype.slice.call(v, 0, n) : v;
}

function concat(arrays: readonly Float64Array[]): Float64Array {
  const out = new Float64Array(arrays.reduce((n, a) => n + a.length, 0));
  let k = 0;
  for (const a of arrays) {
    out.set(a, k);
    k += a.length;
  }
  return out;
}

/** A singleton group for a trace that {@link supplyBinGroups} did not see. */
function soloGroup(trace: FullTrace, dir: BinDir): BinGroup {
  const group: BinGroup = { name: `\u0000${trace._index}__${dir}`, traces: [trace], dirs: [dir] };
  for (const attr of ['start', 'end', 'size'] as const) {
    if (inputBinValue(trace, dir, attr) === undefined) continue;
    group[attr] = (trace[`${dir}bins`] as Record<string, unknown> | undefined)?.[attr];
    group[`${attr}Found`] = true;
  }
  if (!group.sizeFound) group.nbins = numberOr(trace[`nbins${dir}`], 0);
  return group;
}

/** Members of a group usable on `axis` (visible, on an axis of the same type), with their data. */
function groupMembers(
  group: BinGroup,
  axis: BinAxis,
  fullLayout: FullLayout,
): { trace: FullTrace; dir: BinDir }[] {
  const out: { trace: FullTrace; dir: BinDir }[] = [];
  group.traces.forEach((trace, i) => {
    const dir = group.dirs[i]!;
    if (trace.visible === false) return;
    const type = axisTypeOf(fullLayout, trace, dir);
    if (type !== undefined && type !== axis.type) return;
    out.push({ trace, dir });
  });
  return out;
}

/** Plotly's `calcAllAutoBins` for a whole group (cached): its spec and every member's samples. */
function groupBins(
  group: BinGroup,
  trace: FullTrace,
  axis: BinAxis,
  fullLayout: FullLayout,
  cacheKey: unknown,
  options: ResolveBinsOptions,
  overlayEdgeCase = false,
): GroupResult & { singleValued?: boolean } {
  let byAxis = CACHE.get(group);
  const cached = byAxis?.get(cacheKey);
  if (cached && cached.positions.has(trace)) return cached;

  const members = groupMembers(group, axis, fullLayout);
  if (!members.some((m) => m.trace === trace)) {
    members.push({ trace, dir: group.dirs[group.traces.indexOf(trace)] ?? binDirOf(trace) });
  }
  const positions = new Map<FullTrace, Float64Array>();
  for (const m of members) positions.set(m.trace, axis.d2c(dataOf(m.trace, m.dir)));
  const all = concat([...positions.values()]);
  const is2d = members.some((m) => is2dHistogram(m.trace));
  const hasContour = members.some((m) => m.trace.type === 'histogram2dcontour');
  const auto = autoBin(all, axis.type, {
    ...(group.nbins ? { nbins: group.nbins } : {}),
    ...(group.sizeFound ? { size: group.size } : {}),
    is2d,
  });
  let spec: { start: number; end: number; size: BinSize } = {
    start: auto.start,
    end: auto.end,
    size: auto.size,
  };
  if (hasContour) {
    if (!group.sizeFound) spec.start = binIncrement(spec.start, spec.size, true);
    if (!group.endFound) spec.end = binIncrement(spec.end, spec.size);
  }

  // A single-valued histogram overlaying others takes their bin size (Plotly).
  const dir = group.dirs[group.traces.indexOf(trace)] ?? binDirOf(trace);
  const singleValued =
    fullLayout['barmode'] === 'overlay' &&
    !is2dHistogram(trace) &&
    auto.dataSpan === 0 &&
    axis.type !== 'category' &&
    axis.type !== 'multicategory' &&
    trace['bingroup'] === '' &&
    trace._input[`${dir}bins`] === undefined;
  if (singleValued) {
    if (overlayEdgeCase) return { spec, positions, singleValued: true };
    spec = singleValueOverlay(trace, positions.get(trace)!, axis, fullLayout, options, dir);
  }

  // Cumulative edge cases widen the bins by one (Plotly reads the group's last member).
  const last = group.traces[group.traces.length - 1];
  const cumulative = (last?.['cumulative'] ?? {}) as Record<string, unknown>;
  if (cumulative['enabled'] === true && cumulative['currentbin'] !== 'include') {
    if (cumulative['direction'] === 'decreasing') {
      spec.start = binIncrement(spec.start, spec.size, true);
    } else spec.end = binIncrement(spec.end, spec.size);
  }

  if (group.startFound) {
    const s = axis.r2c(group.start);
    if (Number.isFinite(s)) spec.start = s;
  }
  if (group.endFound) {
    const e = axis.r2c(group.end);
    if (Number.isFinite(e)) spec.end = e;
  }
  const result: GroupResult = { spec, positions };
  if (!byAxis) CACHE.set(group, (byAxis = new Map()));
  byAxis.set(cacheKey, result);
  return result;
}

/** Plotly's `handleSingleValueOverlays`, for the trace being calculated. */
function singleValueOverlay(
  trace: FullTrace,
  positions: Float64Array,
  axis: BinAxis,
  fullLayout: FullLayout,
  options: ResolveBinsOptions,
  dir: BinDir,
): { start: number; end: number; size: BinSize } {
  const groups = (fullLayout[BIN_GROUPS_KEY] ?? {}) as Record<string, BinGroup>;
  const fullData = options.fullData ?? [...new Set(Object.values(groups).flatMap((g) => g.traces))];
  const connected = fullData.filter(
    (t) =>
      t.type === 'histogram' &&
      t.visible === true &&
      t['orientation'] === trace['orientation'] &&
      t['xaxis'] === trace['xaxis'] &&
      t['yaxis'] === trace['yaxis'],
  );
  let minSize = Infinity;
  const values: number[] = [firstFinite(positions)];
  for (const other of connected) {
    if (other === trace) continue;
    const name = other[binGroupKey(dir)];
    const group =
      (typeof name === 'string' ? groups[name] : undefined) ?? soloGroup(other, binDirOf(other));
    const r = groupBins(group, other, axis, fullLayout, axis.key ?? axis.type, options, true);
    if (r.singleValued) values.push(firstFinite(r.positions.get(other) ?? new Float64Array(0)));
    else if (typeof r.spec.size === 'number') minSize = Math.min(minSize, r.spec.size);
  }
  if (!Number.isFinite(minSize)) minSize = distinctValues(values).minDiff;
  const v = values[0]!;
  return { start: v - minSize / 2, end: v + minSize / 2, size: minSize };
}

function firstFinite(values: ArrayLike<number>): number {
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i]!)) return values[i]!;
  return NaN;
}

/**
 * A member's own spec (the end of Plotly's `calcAllAutoBins`): an own `start` (or another
 * member's explicit one) moves down onto the group's bin grid, below the member's data; an own
 * `end` (or another member's) ends its bins at its data maximum.
 */
function memberSpec(
  group: BinGroup,
  main: BinSpec,
  trace: FullTrace,
  dir: BinDir,
  axis: BinAxis,
  positions: Float64Array,
): BinSpec {
  const spec = { start: main.start, end: main.end, size: main.size };
  const startIn = axis.r2c(inputBinValue(trace, dir, 'start'));
  const hasStart = Number.isFinite(startIn);
  if ((group.startFound || hasStart) && startIn !== main.start) {
    let traceStart = hasStart ? startIn : Infinity;
    if (!hasStart) for (const v of positions) if (v < traceStart) traceStart = v;
    if (Number.isFinite(traceStart)) {
      const range: [number, number] = [traceStart, binIncrement(traceStart, main.size)];
      let start = firstEdge(main.size, main.start, range);
      if (start > traceStart) start = binIncrement(start, main.size, true);
      spec.start = start;
    }
  }
  const endIn = axis.r2c(inputBinValue(trace, dir, 'end'));
  const hasEnd = Number.isFinite(endIn);
  if ((group.endFound || hasEnd) && endIn !== main.end) {
    let traceEnd = hasEnd ? endIn : -Infinity;
    if (!hasEnd) for (const v of positions) if (v > traceEnd) traceEnd = v;
    if (Number.isFinite(traceEnd)) spec.end = traceEnd;
  }
  return spec;
}

/**
 * Smallest left / right gaps of the samples of every shown member in its own bins (Plotly
 * accumulates them per bin group over the traces it calculates).
 */
function groupGaps(
  group: BinGroup,
  result: GroupResult,
  axis: BinAxis,
): { left: number; right: number } {
  if (result.gaps) return result.gaps;
  let left = Infinity;
  let right = Infinity;
  group.traces.forEach((trace, k) => {
    const positions = result.positions.get(trace);
    if (!positions || trace.visible !== true) return;
    const bins = makeBins(memberSpec(group, result.spec, trace, group.dirs[k]!, axis, positions));
    for (let i = 0; i < positions.length; i++) {
      const v = positions[i]!;
      const n = bins.find(v);
      if (!(n >= 0 && n < bins.count)) continue;
      left = Math.min(left, v - bins.edges[n]!);
      right = Math.min(right, bins.edges[n + 1]! - v);
    }
  });
  return (result.gaps = { left, right });
}

/**
 * A trace's bins in direction `dir` (Plotly's `calcAllAutoBins`): the group's automatic spec
 * (from every member's samples, converted with this trace's axis as Plotly does), with the
 * group's explicit `start` / `end` / `size`, the cumulative and 2D-contour edge adjustments,
 * then this trace's own `start` / `end`: an own `start` (or another member's explicit one) is
 * moved down onto the group's bin grid, below this trace's data.
 *
 * @param axis - This trace's axis in `dir` ({@link binAxis} of its scale).
 */
export function resolveBins(
  trace: FullTrace,
  dir: BinDir,
  axis: BinAxis,
  fullLayout: FullLayout,
  options: ResolveBinsOptions = {},
): ResolvedBins {
  const groups = fullLayout[BIN_GROUPS_KEY] as Record<string, BinGroup> | undefined;
  const name = trace[binGroupKey(dir)];
  const group = (typeof name === 'string' ? groups?.[name] : undefined) ?? soloGroup(trace, dir);
  const result = groupBins(group, trace, axis, fullLayout, axis.key ?? axis.type, options);
  const main = result.spec;
  const positions = result.positions.get(trace) ?? axis.d2c(dataOf(trace, dir));
  const spec = memberSpec(group, main, trace, dir, axis, positions);
  return {
    spec,
    groupSpec: main,
    positions,
    group: group.name,
    get gaps() {
      return groupGaps(group, result, axis);
    },
  };
}
