/**
 * Autorange (plan E3.2): a close port of Plotly's `plots/cartesian/autorange.js`.
 *
 * Traces describe their extent with {@link findExtremes} (one {@link AxisExtremes} per trace and
 * axis); {@link autorange} merges them and solves for the tightest linear range in which every
 * extreme, plus its pixel padding, fits inside the axis length. Then it applies `rangemode`,
 * `autorangeoptions`, partial (`min`/`max`) and reversed autorange, and the `minallowed` /
 * `maxallowed` hard limits.
 *
 * Deviations from Plotly (all deliberate):
 * - no rangebreaks (`calcBreaksLength`), matched axes, or annotation/shape extremes: callers merge
 *   those into the `extremes` they pass;
 * - no extra room for `inside` tick labels on the anchor axis (`padInsideLabelsOnAnchorAxis` needs
 *   measured label boxes, which pure core does not have); Plotly's padding side flip for
 *   `ticklabelposition: 'inside …'` only feeds that measurement, so it is a no-op here;
 * - a single date value spans ±1 day, not ±1 ms (see `singleValueHalfSpan`);
 * - results are always finite with distinct ends, where Plotly can return NaN or an empty range
 *   for contradictory options.
 */
import { EPOCH_2000, ONEDAY, incrementMonth } from './date-math.ts';
import { cleanNumber } from './scale.ts';
import type { AxisExtremes, Autorange, ExtremePoint, Scale } from './types.ts';

/** Plotly's `FP_SAFE`: data beyond this magnitude is treated as junk (it would overflow pads). */
const FP_SAFE = Number.MAX_VALUE * 1e-4;

/** A padding given once for all points, or per point (index-aligned with the data). */
export type PadInput = number | ArrayLike<number>;

/** Options of {@link findExtremes} (Plotly's `findExtremes` opts). */
export interface FindExtremesOptions {
  /** Pixel padding on both sides of every point (e.g. marker radius). */
  ppad?: PadInput;
  /** Pixel padding on the increasing-value side; overrides `ppad` there. */
  ppadplus?: PadInput;
  /** Pixel padding on the decreasing-value side; overrides `ppad` there. */
  ppadminus?: PadInput;
  /** Padding in data units on both sides (e.g. error bars, bar half-widths). */
  vpad?: PadInput;
  /** Data-unit padding above each value; overrides `vpad` there. */
  vpadplus?: PadInput;
  /** Data-unit padding below each value; overrides `vpad` there. */
  vpadminus?: PadInput;
  /** Also leave Plotly's 5%-of-length padding (markers, text); lines-only traces leave it off. */
  padded?: boolean;
  /** Extend to zero (bars, fills to zero). Linear axes only, as in Plotly. */
  tozero?: boolean;
  /** `vpad*` are in linear units (e.g. exponents on log axes) instead of data units. */
  vpadLinearized?: boolean;
}

type PadAccessor = (i: number) => number;

/**
 * Plotly's pad accessors. Pads are clamped to ≥ 0 and NaN-safe; `0`/`undefined` fall through like
 * Plotly's `a || b` chains so `ppadplus: 0` still defers to `ppad`.
 */
function padAccessor(item: PadInput | undefined): { get: PadAccessor; isArray: boolean } {
  if (item !== undefined && typeof item !== 'number') {
    return {
      get: (i) => {
        const v = item[i];
        return v !== undefined && v > 0 ? v : 0;
      },
      isArray: true,
    };
  }
  const v = item !== undefined && item > 0 ? item : 0;
  return { get: () => v, isArray: false };
}

function orPad(...items: (PadInput | undefined)[]): PadInput | undefined {
  for (const it of items) if (it) return it;
  return undefined;
}

/** Whether the scale's current range runs from high to low (Plotly's `ax._m < 0`). */
function isScaleReversed(scale: Scale): boolean {
  return scale.range[1] < scale.range[0];
}

/**
 * Add a candidate extreme, dropping it when an existing point dominates it (at least as extreme,
 * at least as much padding, extrapad no weaker) and removing points it dominates. Plotly's
 * `collapseArray`; keeps extreme lists tiny for typical data.
 */
function collapse(
  array: ExtremePoint[],
  l: number,
  padPx: number,
  extrapad: boolean,
  clipZero: boolean,
  isMax: boolean,
): void {
  for (let j = 0; j < array.length; j++) {
    const v = array[j] as ExtremePoint;
    const vExtra = v.extrapad === true;
    const vAtLeast = isMax ? v.l >= l : v.l <= l;
    const newAtLeast = isMax ? l >= v.l : l <= v.l;
    if (vAtLeast && v.padPx >= padPx && (vExtra || !extrapad)) return;
    if (newAtLeast && v.padPx <= padPx && (extrapad || !vExtra)) {
      array.splice(j, 1);
      j--;
    }
  }
  // A `tozero` clip lands exactly on 0: that end is the baseline, which needs no padding.
  const atZero = clipZero && l === 0;
  array.push({ l, padPx: atZero ? 0 : padPx, extrapad: atZero ? false : extrapad });
}

/**
 * Plotly's `findExtremes`: the extremes a trace contributes to one axis' autorange.
 *
 * `values` are data values (numbers, dates, category names, typed arrays…) converted with
 * `scale.d2l`; values that are not representable (non-positive on log axes, unknown categories)
 * are skipped. Without per-point pad arrays only the two extreme values are examined (a single
 * pass, no allocation for numeric data); with them every point is a candidate and the dominance
 * rules keep the result small. `ppadplus`/`ppadminus` refer to the screen direction, so they swap
 * on reversed scales (Plotly's `ax._m > 0` check).
 *
 * @example
 * ```ts
 * const ext = findExtremes(scale, [3, 1, 4], { ppad: 6, padded: true }); // markers
 * const range = autorange([ext], scale, axis);
 * ```
 */
export function findExtremes(
  scale: Scale,
  values: ArrayLike<unknown>,
  opts: FindExtremesOptions = {},
): AxisExtremes {
  const min: ExtremePoint[] = [];
  const max: ExtremePoint[] = [];
  const isLog = scale.type === 'log';
  const extrapad = opts.padded === true;
  const tozero = opts.tozero === true && scale.type === 'linear';
  const vpadLinearized = opts.vpadLinearized === true;
  const reversed = isScaleReversed(scale);

  const ppadplus = padAccessor(orPad(reversed ? opts.ppadminus : opts.ppadplus, opts.ppad) ?? 0);
  const ppadminus = padAccessor(orPad(reversed ? opts.ppadplus : opts.ppadminus, opts.ppad) ?? 0);
  const vpadplus = padAccessor(orPad(opts.vpadplus, opts.vpad));
  const vpadminus = padAccessor(orPad(opts.vpadminus, opts.vpad));
  const hasArray = ppadplus.isArray || ppadminus.isArray || vpadplus.isArray || vpadminus.isArray;

  // Plotly works in "calc" coordinates: linear except on log axes, where they are the raw data
  // (vpad is in data units, so it must be added before taking the log).
  // Category lookups are by name (and multicategory data may be two rows): convert those once up
  // front. Numeric types convert per element, which allocates nothing for number/typed arrays.
  const data: ArrayLike<unknown> =
    scale.type === 'category' || scale.type === 'multicategory' ? scale.d2lArray(values) : values;
  const toC = (v: unknown): number => {
    if (typeof v === 'number') return v;
    return isLog ? cleanNumber(v) : scale.d2l(v);
  };
  const c2l = (c: number): number => (isLog ? (c > 0 ? Math.log10(c) : NaN) : c);

  const addItem = (c: number, i: number): void => {
    if (!Number.isFinite(c)) return;
    let dmin: number;
    let dmax: number;
    if (vpadLinearized) {
      const l = c2l(c);
      dmin = l - vpadminus.get(i);
      dmax = l + vpadplus.get(i);
    } else {
      let lo = c - vpadminus.get(i);
      const hi = c + vpadplus.get(i);
      // Log axes: a pad spanning more than a decade is clipped to one, so error bars reaching
      // zero or below don't produce a non-positive (or absurdly low) range.
      if (isLog && lo < hi / 10) lo = hi / 10;
      dmin = c2l(lo);
      dmax = c2l(hi);
    }
    if (tozero) {
      dmin = Math.min(0, dmin);
      dmax = Math.max(0, dmax);
    }
    if (Math.abs(dmin) < FP_SAFE) collapse(min, dmin, ppadminus.get(i), extrapad, tozero, false);
    if (Math.abs(dmax) < FP_SAFE) collapse(max, dmax, ppadplus.get(i), extrapad, tozero, true);
  };

  const n = data.length;
  if (!hasArray) {
    // Uniform pads: only the extreme values matter.
    let vmin = Infinity;
    let vmax = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = toC(data[i]);
      if (v < vmin && (isLog ? v > 0 : v > -FP_SAFE)) vmin = v;
      if (v > vmax && v < FP_SAFE) vmax = v;
    }
    addItem(vmin, 0);
    addItem(vmax, 1);
  } else {
    // Near-monotonic data is common: seed with a few points from each end so dominance prunes
    // most of the middle early.
    const iMax = Math.min(6, n);
    for (let i = 0; i < iMax; i++) addItem(toC(data[i]), i);
    for (let i = n - 1; i >= iMax; i--) addItem(toC(data[i]), i);
  }
  return { min, max };
}

/**
 * Merge the extremes of several traces into one collapsed pair of lists (Plotly's
 * `concatExtremes`). Traces flagged `tozero` add an unpadded 0 on linear scales. Non-finite points
 * are dropped.
 */
export function concatExtremes(
  extremes: readonly AxisExtremes[],
  scale: Scale,
): { min: ExtremePoint[]; max: ExtremePoint[] } {
  const min: ExtremePoint[] = [];
  const max: ExtremePoint[] = [];
  for (const e of extremes) {
    for (const p of e.min) {
      if (Number.isFinite(p.l))
        collapse(min, p.l, pad0(p.padPx), p.extrapad === true, false, false);
    }
    for (const p of e.max) {
      if (Number.isFinite(p.l)) collapse(max, p.l, pad0(p.padPx), p.extrapad === true, false, true);
    }
    if (e.tozero === true && scale.type === 'linear') {
      collapse(min, 0, 0, false, false, false);
      collapse(max, 0, 0, false, false, true);
    }
  }
  return { min, max };
}

function pad0(px: number): number {
  return px > 0 ? px : 0;
}

/** The axis attributes autorange reads (missing fields take their schema defaults). */
interface AxisView {
  _id?: unknown;
  autorange?: unknown;
  range?: unknown;
  rangemode?: unknown;
  autorangeoptions?: {
    minallowed?: unknown;
    maxallowed?: unknown;
    clipmin?: unknown;
    clipmax?: unknown;
    include?: unknown;
  } | null;
  minallowed?: unknown;
  maxallowed?: unknown;
}

function isSet(v: unknown): boolean {
  return v !== undefined && v !== null;
}

function isArrayLike(v: unknown): v is ArrayLike<unknown> {
  return Array.isArray(v) || (ArrayBuffer.isView(v) && !(v instanceof DataView));
}

/** `axis.range` in linear space; NaN for missing (`null`) or invalid ends. */
function rangeL(scale: Scale, range: unknown): [number, number] {
  if (!isArrayLike(range) || range.length < 2) return [NaN, NaN];
  const conv = (v: unknown): number => (isSet(v) ? scale.r2l(v) : NaN);
  return [conv(range[0]), conv(range[1])];
}

/**
 * `autorangeoptions` values are data units (Plotly converts them with `d2l`). Category data
 * lookups reject fractional indices, which `r2l` accepts along with names, so non-log axes use
 * `r2l` (identical to `d2l` for linear and date).
 */
function optionL(scale: Scale, v: unknown): number {
  if (!isSet(v)) return NaN;
  return scale.type === 'log' ? scale.d2l(v) : scale.r2l(v);
}

/** Plotly's `hasValidMinAndMax`: a min/max pair is usable unless both are set and min ≥ max. */
function validPair(lo: number, hi: number, loSet: boolean, hiSet: boolean): boolean {
  return !(loSet && hiSet) || lo < hi;
}

/**
 * Half-width of the range around a single value. Plotly uses ±1 linear unit everywhere; on date
 * axes that is ±1 ms, which yields sub-millisecond ticks for a lone date. ±1 day shows the date
 * with sensible ticks, so date axes use that; linear, category and log (a decade) keep Plotly's 1.
 */
function singleValueHalfSpan(scale: Scale): number {
  return scale.type === 'date' ? ONEDAY : 1;
}

/** Plotly's default ranges when an axis has no data and no valid `range`. */
function defaultRange(scale: Scale, id: unknown): [number, number] {
  if (scale.type === 'date') return [EPOCH_2000, incrementMonth(EPOCH_2000, 12)];
  const isY = typeof id === 'string' && id.charAt(0) === 'y';
  return [-1, isY ? 4 : 6];
}

/**
 * Plotly's `getAutoRange` + `applyAutorangeOptions` + `limitRange`: the autoranged axis range in
 * linear space (`[r0, r1]`, `r0 > r1` when reversed).
 *
 * - The range is the tightest one in which every extreme fits with its `padPx` (plus 5% of the
 *   axis length for `extrapad` points). When padding would leave the data less than 10% of the
 *   axis, pads are dropped for the offending pair (the data values themselves still fit).
 * - A single distinct value spans ±1 (±1 day on date axes); with `rangemode: 'tozero'` it becomes
 *   `[0, v']` where `v'` leaves the value's padding (Plotly's formula).
 * - `rangemode` (`tozero`, `nonnegative`) and `AxisExtremes.tozero` apply on linear axes only.
 * - `autorange: 'reversed' | 'min reversed' | 'max reversed'` return a reversed range; `true` keeps
 *   the reversal of an existing reversed `axis.range` (Plotly). `false` returns a valid
 *   `axis.range` unchanged, and autoranges otherwise.
 * - Partial `'min'`/`'max'` (and their reversed variants) autorange the data minimum/maximum only;
 *   the other end is fixed from `axis.range` (its non-null element; Plotly's layout is
 *   `min` → `[null, hi]`, `max` → `[lo, null]`, `max reversed` → `[null, lo]`, `min reversed` →
 *   `[hi, null]`). The fixed end joins the padding solve as an unpadded point, so the autoranged
 *   end's padding is exact. Without a valid fixed end the axis autoranges fully.
 * - `autorangeoptions` (data units) apply to autoranged ends only: `include` extends the range,
 *   `minallowed`/`maxallowed` pin an end, `clipmin`/`clipmax` bound it (a min/max pair is ignored
 *   when min ≥ max). Top-level `minallowed`/`maxallowed` (range units, as Plotly's `limitRange`)
 *   then clamp both ends.
 * - With no extremes, a valid `axis.range` is returned, else Plotly's defaults: `[-1, 6]` for x
 *   and `[-1, 4]` for y axes (exponents on log, indices on category), 2000-01-01 → 2001-01-01 on
 *   date axes (reversed when requested).
 *
 * The result is always finite with `r0 !== r1`.
 */
export const autorange: Autorange = (extremes, scale, axis) => {
  const a: AxisView = axis as unknown as AxisView;
  const mode = a.autorange ?? true;
  const userRange = rangeL(scale, a.range);
  const userValid =
    Number.isFinite(userRange[0]) && Number.isFinite(userRange[1]) && userRange[0] !== userRange[1];
  if (mode === false && userValid) return [userRange[0], userRange[1]];

  const reversed =
    mode === 'reversed' ||
    mode === 'min reversed' ||
    mode === 'max reversed' ||
    userRange[1] < userRange[0];
  const unit = singleValueHalfSpan(scale);

  let autoMin = mode !== 'max' && mode !== 'max reversed';
  let autoMax = mode !== 'min' && mode !== 'min reversed';
  let fixed = NaN;
  if (!autoMin || !autoMax) {
    const idx = mode === 'min' || mode === 'max reversed' ? 1 : 0;
    const preferred = userRange[idx] as number;
    const other = userRange[1 - idx] as number;
    fixed = Number.isFinite(preferred) ? preferred : other;
    if (!Number.isFinite(fixed)) autoMin = autoMax = true;
  }
  const finish = (lo: number, hi: number): [number, number] => (reversed ? [hi, lo] : [lo, hi]);

  const merged = concatExtremes(extremes, scale);
  if (merged.min.length === 0 || merged.max.length === 0) {
    const base = userValid ? userRange : defaultRange(scale, a._id);
    let lo = Math.min(base[0], base[1]);
    let hi = Math.max(base[0], base[1]);
    if (!autoMax) [lo, hi] = [fixed - (hi - lo), fixed];
    else if (!autoMin) [lo, hi] = [fixed, fixed + (hi - lo)];
    return finish(lo, hi);
  }

  const minArray = merged.min;
  const maxArray = merged.max;
  // The fixed end of a partial autorange is an unpadded extreme, so padding on the other end is
  // solved against the actual span.
  if (!autoMin) minArray.splice(0, minArray.length, { l: fixed, padPx: 0, extrapad: false });
  if (!autoMax) maxArray.splice(0, maxArray.length, { l: fixed, padPx: 0, extrapad: false });

  const len = scale.length > 0 && Number.isFinite(scale.length) ? scale.length : 0;
  const extrapadPx = 0.05 * len;
  const pad = (p: ExtremePoint): number => p.padPx + (p.extrapad === true ? extrapadPx : 0);

  const isLinear = scale.type === 'linear';
  const toZero = isLinear && a.rangemode === 'tozero';
  const nonNegative = isLinear && a.rangemode === 'nonnegative';

  // Plotly's "single value" test: all min and max candidates coincide.
  let minmin = (minArray[0] as ExtremePoint).l;
  let maxmax = (maxArray[0] as ExtremePoint).l;
  for (let i = 1; i < minArray.length && minmin === maxmax; i++) {
    minmin = Math.min(minmin, (minArray[i] as ExtremePoint).l);
  }
  for (let i = 1; i < maxArray.length && minmin === maxmax; i++) {
    maxmax = Math.max(maxmax, (maxArray[i] as ExtremePoint).l);
  }

  let lo: number;
  let hi: number;
  if (minmin === maxmax) {
    const v = minmin;
    if (toZero) {
      if (v === 0) {
        // Only zero: pin it to the low end, as `tozero` usually does.
        [lo, hi] = [0, 1];
      } else {
        // Push the lone value off the far edge by its padding, with the zero edge unpadded.
        let maxPad = 0;
        for (const p of v > 0 ? maxArray : minArray) maxPad = Math.max(maxPad, pad(p));
        const end = len > 0 ? v / (1 - Math.min(0.5, maxPad / len)) : v;
        [lo, hi] = v > 0 ? [0, end] : [end, 0];
      }
    } else if (nonNegative) {
      [lo, hi] = [Math.max(0, v - unit), Math.max(1, v + unit)];
    } else {
      [lo, hi] = [v - unit, v + unit];
    }
  } else {
    // Maximize data-per-pixel over all (min, max) pairs: the winning pair's padding then fits
    // every other point too.
    const minSpan = len / 10;
    let mbest = 0;
    let minbest: ExtremePoint | undefined;
    let maxbest: ExtremePoint | undefined;
    for (const minpt of minArray) {
      for (const maxpt of maxArray) {
        const dv = maxpt.l - minpt.l;
        if (!(dv > 0)) continue;
        const dp = len - pad(minpt) - pad(maxpt);
        if (dp > minSpan) {
          if (dv / dp > mbest) {
            minbest = minpt;
            maxbest = maxpt;
            mbest = dv / dp;
          }
        } else if (dv / len > mbest) {
          // Padding would squeeze the data below 10% of the axis: keep the values, drop the pads.
          minbest = { l: minpt.l, padPx: 0 };
          maxbest = { l: maxpt.l, padPx: 0 };
          mbest = dv / len;
        }
      }
    }
    if (minbest === undefined || maxbest === undefined) {
      // Contradictory extremes (every max below every min, e.g. a fixed end outside the data).
      [lo, hi] = [minmin, maxmax];
    } else {
      if (toZero) {
        if (minbest.l >= 0) minbest = { l: 0, padPx: 0 };
        if (maxbest.l <= 0) maxbest = { l: 0, padPx: 0 };
      } else if (nonNegative) {
        // (An unpadded point skips the product: `mbest` is infinite on zero-length axes.)
        const pmin = pad(minbest);
        if (minbest.l - (pmin > 0 ? mbest * pmin : 0) < 0) minbest = { l: 0, padPx: 0 };
        if (maxbest.l <= 0) maxbest = { l: 1, padPx: 0 };
      }
      // The pair may have changed: solve again for its slope.
      const den = len - pad(minbest) - pad(maxbest);
      const m = den > 0 ? (maxbest.l - minbest.l) / den : 0;
      lo = minbest.l - m * pad(minbest);
      hi = maxbest.l + m * pad(maxbest);
      // The winning pair's range contains every other extreme, except when pairs tie (a
      // zero-length axis: all ratios are infinite, so the first pair found would win). Keep every
      // extreme value visible; `nonnegative` still floors the range at 0.
      const floor = nonNegative ? 0 : -Infinity;
      for (const p of minArray) lo = Math.min(lo, Math.max(floor, p.l));
      for (const p of maxArray) hi = Math.max(hi, p.l);
    }
  }

  // --- autorangeoptions (autoranged ends only) --------------------------------------------------
  let pinnedLo = !autoMin;
  let pinnedHi = !autoMax;
  const opts = a.autorangeoptions;
  if (opts) {
    const include = opts.include;
    if (isSet(include)) {
      const list: ArrayLike<unknown> = isArrayLike(include) ? include : [include];
      for (let i = 0; i < list.length; i++) {
        const v = optionL(scale, list[i]);
        if (!Number.isFinite(v)) continue;
        if (autoMin && v < lo) lo = v;
        if (autoMax && v > hi) hi = v;
      }
    }
    const minA = optionL(scale, opts.minallowed);
    const maxA = optionL(scale, opts.maxallowed);
    const allowedOk = validPair(minA, maxA, isSet(opts.minallowed), isSet(opts.maxallowed));
    const clipLo = optionL(scale, opts.clipmin);
    const clipHi = optionL(scale, opts.clipmax);
    const clipOk = validPair(clipLo, clipHi, isSet(opts.clipmin), isSet(opts.clipmax));
    if (autoMin) {
      if (Number.isFinite(minA) && allowedOk) {
        lo = minA;
        pinnedLo = true;
      } else if (Number.isFinite(clipLo) && clipOk && clipLo > lo) {
        lo = clipLo;
        pinnedLo = true;
      }
    }
    if (autoMax) {
      if (Number.isFinite(maxA) && allowedOk) {
        hi = maxA;
        pinnedHi = true;
      } else if (Number.isFinite(clipHi) && clipOk && clipHi < hi) {
        hi = clipHi;
        pinnedHi = true;
      }
    }
  }
  if (!autoMin) lo = fixed;
  if (!autoMax) hi = fixed;

  // --- limitRange: top-level minallowed/maxallowed (range units) ---------------------------------
  let bLo = isSet(a.minallowed) ? scale.r2l(a.minallowed) : NaN;
  let bHi = isSet(a.maxallowed) ? scale.r2l(a.maxallowed) : NaN;
  if (Number.isFinite(bLo) && Number.isFinite(bHi) && !(bLo < bHi)) bLo = bHi = NaN;
  if (lo < bLo) {
    lo = bLo;
    pinnedLo = true;
  }
  if (hi > bHi) {
    hi = bHi;
    pinnedHi = true;
  }

  // --- Always return a usable range -------------------------------------------------------------
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    [lo, hi] = defaultRange(scale, a._id);
  }
  if (!(lo < hi)) {
    // Contradictory constraints collapsed or crossed the ends: keep the pinned end and step one
    // unit away from it, staying inside the hard limits.
    if (pinnedHi && !pinnedLo) lo = hi - unit;
    else hi = lo + unit;
    if (hi > bHi) {
      hi = bHi;
      lo = Math.min(lo, hi - unit);
    }
    if (lo < bLo) {
      lo = bLo;
      hi = Math.max(hi, lo + unit);
    }
  }
  return finish(lo, hi);
};
