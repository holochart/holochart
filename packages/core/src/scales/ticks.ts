/**
 * Tick generation (plan E3.3): a port of Plotly's `calcTicks` and its helpers (`tickFirst`,
 * `tickIncrement`, `prepMinorTicks`, `arrayTicks`, `positionPeriodTicks`).
 *
 * The step and label precision come from `tickSpec` (format.ts, Plotly's `prepTicks`); this module
 * places major ticks from the first one inside the range, adds period-mode label positions and
 * minor ticks, and labels the majors. Numeric ticks are computed as `x0 + k·dtick` and rounded to
 * the precision of `dtick`/`tick0` rather than accumulated, so labels never show float drift.
 */
import type { FullAxis } from '../defaults/types.ts';
import {
  HALFDAY,
  incrementMonth,
  mod,
  ONEAVGMONTH,
  ONEAVGQUARTER,
  ONEAVGYEAR,
  ONEDAY,
  ONEHOUR,
  ONEMAXMONTH,
  ONEMAXQUARTER,
  ONEMAXYEAR,
  ONEMINMONTH,
  ONEMINQUARTER,
  ONEMINYEAR,
  ONEWEEK,
} from './date-math.ts';
import {
  createTickFormatter,
  dtickValue,
  parseDtick,
  resolveTickMode,
  ROUND_LOG_1,
  ROUND_LOG_2,
  roundUp,
  tickOptions,
  tickSpec,
} from './format.ts';
import type { Dtick, TickFormatter, TickMode, TickOptions, TickSpec } from './format.ts';
import type { ComputeTicks, Scale, Tick } from './types.ts';

/**
 * Widen a linear range by 0.01% at both ends (keeping its direction), so ticks that land on the
 * range ends despite rounding are kept.
 */
export function expandRange(range: readonly [number, number]): [number, number] {
  // Scale before subtracting so ranges near ±Number.MAX_VALUE don't overflow to Infinity.
  const delta = range[1] * 0.0001 - range[0] * 0.0001;
  return [range[0] - delta, range[1] + delta];
}

/** Digits after the decimal point in the shortest representation of `x`. */
function decimals(x: number): number {
  if (!Number.isFinite(x)) return 0;
  const s = String(Math.abs(x));
  const e = s.indexOf('e');
  const mant = e < 0 ? s : s.slice(0, e);
  const exp = e < 0 ? 0 : Number(s.slice(e + 1));
  const dot = mant.indexOf('.');
  return Math.max(0, (dot < 0 ? 0 : mant.length - dot - 1) - exp);
}

/** Round `v` to `digits` decimals (removes float noise such as 0.6000000000000001). */
function cleanTick(v: number, digits: number): number {
  return digits > 100 || !Number.isFinite(v) ? v : Number(v.toFixed(digits));
}

/** Plotly's `d3.round(x, 1)`. */
function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/**
 * Plotly's `tickIncrement`: the tick after `x` for a step (`reverse` steps backwards). Month
 * steps keep the time of day, `L<f>` steps linearly in data units, `D1`/`D2` go to the next digit.
 * Returns NaN for an unrecognized step.
 */
export function tickIncrement(x: number, dtick: Dtick, reverse = false): number {
  const sign = reverse ? -1 : 1;
  if (typeof dtick === 'number') return Number((x + sign * dtick).toPrecision(15));
  const kind = dtick.charAt(0);
  const dt = sign * Number(dtick.slice(1));
  if (kind === 'M') return incrementMonth(x, dt);
  if (kind === 'L') return Math.log(Math.pow(10, x) + dt) / Math.LN10;
  if (kind === 'D') {
    // log10 of 1…9 (or 1, 2, 5) only has to be close enough to round.
    const tickset = dtick === 'D2' ? ROUND_LOG_2 : ROUND_LOG_1;
    const x2 = x + sign * 0.01;
    const frac = roundUp(mod(x2, 1), tickset, reverse);
    return Math.floor(x2) + Math.log(round1(Math.pow(10, frac))) / Math.LN10;
  }
  return NaN;
}

function categoryCount(scale: Scale): number {
  return scale.type === 'multicategory' ? scale.multicategories.length : scale.categories.length;
}

/** Plotly's `Lib.constrain`, including its behavior for an empty interval (`lo > hi`). */
function constrain(v: number, lo: number, hi: number): number {
  return lo > hi ? Math.max(hi, Math.min(lo, v)) : Math.max(lo, Math.min(hi, v));
}

/**
 * Plotly's `tickFirst`: the first tick at or past the start of `range` (default `scale.range`)
 * for a step and anchor, in linear space. Category ticks stay within the category list.
 */
export function tickFirst(
  scale: Scale,
  spec: Pick<TickSpec, 'dtick' | 'tick0'>,
  range: readonly [number, number] = scale.range,
): number {
  const axrev = range[1] < range[0];
  const sRound = axrev ? Math.floor : Math.ceil;
  const r0 = expandRange(range)[0];
  const { dtick, tick0 } = spec;
  if (typeof dtick === 'number') {
    const digits = Math.max(decimals(dtick), decimals(tick0));
    let tmin = cleanTick(sRound((r0 - tick0) / dtick) * dtick + tick0, digits);
    if (scale.type === 'category' || scale.type === 'multicategory') {
      tmin = constrain(tmin, 0, categoryCount(scale) - 1);
    }
    return tmin;
  }
  const kind = dtick.charAt(0);
  const dtNum = Number(dtick.slice(1));
  if (kind === 'M') {
    // Works for any nearly linear step: jump by whole steps towards r0 until two consecutive
    // ticks straddle it (normally ≤ 3 iterations for Gregorian months).
    let t0 = tick0;
    for (let cnt = 0; cnt < 10; cnt++) {
      const t1 = tickIncrement(t0, dtick, axrev);
      if ((t1 - r0) * (t0 - r0) <= 0) return axrev ? Math.min(t0, t1) : Math.max(t0, t1);
      const mult = (r0 - (t0 + t1) / 2) / (t1 - t0);
      const jump = `M${(Math.abs(Math.round(mult)) || 1) * dtNum}`;
      t0 = tickIncrement(t0, jump, mult < 0 ? !axrev : axrev);
    }
    return t0;
  }
  if (kind === 'L') {
    const digits = Math.max(decimals(dtNum), decimals(tick0));
    const v = cleanTick(sRound((Math.pow(10, r0) - tick0) / dtNum) * dtNum + tick0, digits);
    return Math.log(v) / Math.LN10;
  }
  if (kind === 'D') {
    const tickset = dtick === 'D2' ? ROUND_LOG_2 : ROUND_LOG_1;
    const frac = roundUp(mod(r0, 1), tickset, axrev);
    return Math.floor(r0) + Math.log(round1(Math.pow(10, frac))) / Math.LN10;
  }
  return NaN;
}

/**
 * Tick values from `x0` (index `kStart`, -1 for the extra leading period tick) through `end`,
 * at most `maxTicks + 1` of them, stopping if a value repeats (step below float resolution).
 */
function tickSequence(
  spec: Pick<TickSpec, 'dtick' | 'tick0'>,
  x0: number,
  end: number,
  axrev: boolean,
  maxTicks: number,
  kStart: number,
): number[] {
  const { dtick, tick0 } = spec;
  const sign = axrev ? -1 : 1;
  let at: (k: number, prev: number) => number;
  if (typeof dtick === 'number') {
    const digits = Math.max(decimals(dtick), decimals(tick0));
    at = (k) => cleanTick(x0 + k * sign * dtick, digits);
  } else {
    const kind = dtick.charAt(0);
    const n = dtickValue(dtick);
    if (kind === 'M') {
      at = (k) => incrementMonth(x0, k * sign * n);
    } else if (kind === 'L') {
      // Step in data units from x0's index, so values stay exact (0.3, not 0.30000000000000004).
      const digits = Math.max(decimals(n), decimals(tick0));
      const j0 = Math.round((Math.pow(10, x0) - tick0) / n);
      at = (k) => Math.log(cleanTick(tick0 + (j0 + k * sign) * n, digits)) / Math.LN10;
    } else {
      at = (k, prev) =>
        k < 0 ? tickIncrement(x0, dtick, !axrev) : tickIncrement(prev, dtick, axrev);
    }
  }
  const out: number[] = [];
  let prev = NaN;
  for (let k = kStart; ; k++) {
    const x = k === 0 ? x0 : at(k, prev);
    if (!Number.isFinite(x) || !(axrev ? x >= end : x <= end)) break;
    if (out.length > maxTicks || x === prev) break;
    out.push(x);
    prev = x;
  }
  return out;
}

function isMultiple(bigger: number, smaller: number): boolean {
  return Math.abs(((bigger / smaller + 0.5) % 1) - 0.5) < 0.001;
}

function isClose(a: number, b: number): boolean {
  return Math.abs(a / b - 1) < 0.001;
}

/**
 * Plotly's `prepMinorTicks` corrections: make an auto minor step divide the major one evenly
 * (days under weeks, months under quarters/years, `D1` under decades, …).
 */
function adjustMinorDtick(major: Dtick, minor: Dtick, explicitNticks: boolean): Dtick {
  const numericMajor = typeof major === 'number';
  const numericMinor = typeof minor === 'number';
  const majorNum = dtickValue(major);
  const minorNum = dtickValue(minor);
  if (numericMajor && numericMinor) {
    if (!isMultiple(majorNum, minorNum)) {
      // Only when minor.nticks is below two jumps of the auto scale (5 → 2, 15 → 10, …).
      if (majorNum === 2 * ONEWEEK && minorNum === 3 * ONEDAY) return ONEWEEK;
      // 7 days per week is so close to the default 5 minor ticks that we'd get odd steps.
      if (majorNum === ONEWEEK && !explicitNticks) return ONEDAY;
      if (isClose(majorNum / minorNum, 2.5)) return majorNum / 2;
      return majorNum;
    }
    // Every 2 days of a 2-week step would look odd: use weeks.
    if (majorNum === 2 * ONEWEEK && minorNum === 2 * ONEDAY) return ONEWEEK;
    return minor;
  }
  if (typeof major === 'string' && major.charAt(0) === 'M') {
    // Sub-month minors under quarters/years become months. Under single months Plotly would pick
    // M1 as well (so every minor coincides with a major and is dropped); keep days/weeks instead.
    if (numericMinor) return majorNum > 1 ? 'M1' : minor;
    if (!isMultiple(majorNum, minorNum)) return major;
    // Years step 2 → 6 months, and 6 is not a multiple of 4: use quarters.
    if (majorNum >= 12 && minorNum === 2) return 'M3';
    return minor;
  }
  if (typeof minor === 'string' && minor.charAt(0) === 'L') {
    if (typeof major === 'string' && major.charAt(0) === 'L') {
      if (!isMultiple(majorNum, minorNum)) {
        return isClose(majorNum / minorNum, 2.5) ? `L${majorNum / 2}` : major;
      }
      return minor;
    }
    return 'D1';
  }
  // D2 minors are unevenly spaced under multi-decade majors: use every decade.
  if (minor === 'D2' && numericMajor && majorNum > 1) return 1;
  return minor;
}

/** Step and anchor of the minor ticks (Plotly's `prepMinorTicks`). */
function minorTickSpec(
  scale: Scale,
  axis: FullAxis,
  o: TickOptions,
  major: TickSpec,
  tmin: number | undefined,
): { mode: TickMode; dtick: Dtick; tick0: number } {
  const type = scale.type;
  const userDtick = parseDtick(o.minor.dtick, type);
  const mode = resolveTickMode(o.minor.tickmode, o.minor.tickvals, userDtick);
  let dtick: Dtick;
  if (mode === 'linear' && userDtick !== undefined) {
    dtick = userDtick;
  } else {
    const hasMajor = major.mode !== 'array' && tmin !== undefined && Number.isFinite(tmin);
    const [r0, r1] = scale.range;
    let mockRange: [number, number];
    if (hasMajor) {
      // A tiny bit less than one major interval. Plotly steps back from the first tick; `L<f>`
      // steps can't always (10 - 10 = 0 has no log), so step forward instead.
      let tick2 = tickIncrement(tmin, major.dtick, true);
      if (!Number.isFinite(tick2)) tick2 = tickIncrement(tmin, major.dtick);
      mockRange = [tmin, tick2 * 0.99 + tmin * 0.01];
    } else {
      // No major step: let minor.nticks span a fifth of the axis.
      mockRange = [r0, 0.8 * r0 + 0.2 * r1];
    }
    dtick = tickSpec(scale, axis, { minor: true, range: mockRange }).dtick;
    if (hasMajor) dtick = adjustMinorDtick(major.dtick, dtick, o.minor.nticks !== 5);
  }
  let tick0 = major.tick0;
  if (mode === 'linear' && dtick !== 'D1' && dtick !== 'D2') {
    const t = o.minor.tick0;
    const l = t === undefined || t === null || t === '' ? NaN : scale.r2l(t);
    if (Number.isFinite(l)) tick0 = l;
  }
  return { mode, dtick, tick0 };
}

/**
 * Plotly's `arrayTicks`: `tickvals` strictly inside the (slightly expanded) range, labelled with
 * `ticktext` or formatted with extra precision. Sorted in range order (Plotly keeps input order).
 */
function arrayTicks(
  scale: Scale,
  vals: ArrayLike<unknown> | undefined,
  text: ArrayLike<unknown> | undefined,
  fmt: TickFormatter,
  minor: boolean,
): Tick[] {
  if (vals === undefined) return [];
  const ex = expandRange(scale.range);
  const lo = Math.min(ex[0], ex[1]);
  const hi = Math.max(ex[0], ex[1]);
  const found: { l: number; i: number }[] = [];
  for (let i = 0; i < vals.length; i++) {
    const l = scale.d2l(vals[i]);
    if (l > lo && l < hi) found.push({ l, i });
  }
  const axrev = scale.range[1] < scale.range[0];
  found.sort((a, b) => (axrev ? b.l - a.l : a.l - b.l));
  if (minor) return found.map(({ l }) => ({ l, text: '', minor: true }));
  fmt.first = found[0]?.l;
  fmt.last = found[found.length - 1]?.l;
  return found.map(({ l, i }) => {
    const t = text?.[i];
    if (t !== undefined && t !== null) return { l, text: String(t) };
    return toTick(l, fmt.label(l));
  });
}

function toTick(l: number, label: { text: string; text2?: string; fontScale?: number }): Tick {
  const tick: Tick = { l, text: label.text };
  if (label.text2 !== undefined) tick.text2 = label.text2;
  if (label.fontScale !== undefined) tick.fontScale = label.fontScale;
  return tick;
}

interface MajorValue {
  l: number;
  /** D1/D2 in-between tick: digit label without prefix/suffix. */
  simpleLabel?: boolean;
  /** Hidden by `ticklabelstep`. */
  skipLabel?: boolean;
  /** Period mode: label position. */
  periodX?: number;
}

/**
 * Plotly's `positionPeriodTicks`: move each label to the middle of the period starting at its
 * tick — the period the tick format names (`definedDelta`) or the calendar unit nearest the step,
 * never past the next tick.
 */
function positionPeriodTicks(ticks: MajorValue[], definedDelta: number | undefined): void {
  for (let i = 0; i < ticks.length; i++) {
    const v = (ticks[i] as MajorValue).l;
    let a = i;
    let b = i;
    if (i < ticks.length - 1) b = i + 1;
    else if (i > 0) a = i - 1;
    const actualDelta = Math.abs((ticks[b] as MajorValue).l - (ticks[a] as MajorValue).l);
    const delta = definedDelta ?? actualDelta;
    let periodLength = 0;
    if (delta >= ONEMINYEAR) {
      periodLength =
        actualDelta >= ONEMINYEAR && actualDelta <= ONEMAXYEAR ? actualDelta : ONEAVGYEAR;
    } else if (definedDelta === ONEAVGQUARTER && delta >= ONEMINQUARTER) {
      periodLength =
        actualDelta >= ONEMINQUARTER && actualDelta <= ONEMAXQUARTER ? actualDelta : ONEAVGQUARTER;
    } else if (delta >= ONEMINMONTH) {
      periodLength =
        actualDelta >= ONEMINMONTH && actualDelta <= ONEMAXMONTH ? actualDelta : ONEAVGMONTH;
    } else if (definedDelta === ONEWEEK && delta >= ONEWEEK) {
      periodLength = ONEWEEK;
    } else if (delta >= ONEDAY) {
      periodLength = ONEDAY;
    } else if (definedDelta === HALFDAY && delta >= HALFDAY) {
      periodLength = HALFDAY;
    } else if (definedDelta === ONEHOUR && delta >= ONEHOUR) {
      periodLength = ONEHOUR;
    }
    // Labels stay between their tick and the next.
    if (periodLength >= actualDelta) periodLength = actualDelta;
    (ticks[i] as MajorValue).periodX = v + periodLength / 2;
  }
}

/** Sorted-array membership within `eps`. */
function hasNear(sorted: readonly number[], v: number, eps: number): boolean {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const m = sorted[mid] as number;
    if (Math.abs(m - v) <= eps) return true;
    if (m < v) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}

/**
 * Compute the ticks of an axis (Plotly's `calcTicks`): labelled major ticks in range order, then
 * minor ticks (`{ l, text: '', minor: true }`) when `minor.ticks` or `minor.showgrid` is set.
 *
 * Honors `tickmode` (`auto`, `linear`, `array`; `sync` as `auto`), `nticks`, `tick0`, `dtick`,
 * `tickvals`/`ticktext`, `ticklabelstep`, `ticklabelmode: 'period'` (labels centered in their
 * period via `labelL`, plus a label-only leading tick with `noTick`) and the label attributes (see
 * `createTickFormatter`). The range and length come from `scale`; `axis` is never mutated.
 *
 * @example
 * ```ts
 * const scale = createScale({ type: 'linear', range: [0, 10], length: 400 });
 * computeTicks(scale, xaxis).map((t) => t.text); // ['0', '2', '4', '6', '8', '10']
 * ```
 */
export const computeTicks: ComputeTicks = (scale, axis) => {
  const range = scale.range;
  const [r0, r1] = range;
  if (!Number.isFinite(r0) || !Number.isFinite(r1)) return [];
  const o = tickOptions(axis);
  const type = scale.type;
  const axrev = r1 < r0;
  const minRange = Math.min(r0, r1);
  const maxRange = Math.max(r0, r1);
  // At most about one tick per pixel.
  const maxTicks = Math.max(1000, Number.isFinite(scale.length) ? scale.length : 0);
  const hasMinor = o.minor.ticks !== '' || o.minor.showgrid;
  const isPeriod = type === 'date' && o.ticklabelmode === 'period';
  const minorMode = resolveTickMode(
    o.minor.tickmode,
    o.minor.tickvals,
    parseDtick(o.minor.dtick, type),
  );
  const spec = tickSpec(scale, axis, { arrayPrecision: !hasMinor || minorMode === 'array' });
  const fmt = createTickFormatter(scale, axis, spec);

  const ticks: Tick[] = [];
  const majors: MajorValue[] = [];
  let tmin: number | undefined;
  let visible = true;
  if (spec.mode === 'array') {
    ticks.push(...arrayTicks(scale, o.tickvals, o.ticktext, fmt, false));
  } else {
    const ex = expandRange(range);
    let end = ex[1];
    const x0 = tickFirst(scale, spec, range);
    tmin = x0;
    // No visible ticks (e.g. every category off the edge): no minor ticks either.
    if (x0 < ex[0] !== axrev) visible = false;
    else {
      if (type === 'category' || type === 'multicategory') {
        end = axrev ? Math.max(-0.5, end) : Math.min(categoryCount(scale) - 0.5, end);
      }
      const step = o.ticklabelstep;
      let majorId = 0;
      if (step > 1) {
        // Tick index relative to tick0, so the labelled ticks stay put while panning.
        const d =
          typeof spec.dtick === 'number'
            ? spec.dtick
            : type === 'date'
              ? ONEAVGMONTH * dtickValue(spec.dtick)
              : spec.roughDTick;
        majorId = Math.round((x0 - spec.tick0) / d) - 1;
        // The extra period tick comes before x0.
        if (isPeriod) majorId--;
      }
      const isDLog =
        type === 'log' && typeof spec.dtick === 'string' && spec.dtick.charAt(0) === 'D';
      for (const l of tickSequence(spec, x0, end, axrev, maxTicks, isPeriod ? -1 : 0)) {
        const m: MajorValue = { l };
        if (isDLog && !Number.isInteger(l)) m.simpleLabel = true;
        if (step > 1) {
          majorId++;
          m.skipLabel = majorId % step !== 0;
        }
        majors.push(m);
      }
    }
  }

  let minors: number[] = [];
  const minorTicks: Tick[] = [];
  if (hasMinor && visible) {
    const mspec = minorTickSpec(scale, axis, o, spec, tmin);
    if (mspec.mode === 'array') {
      minorTicks.push(...arrayTicks(scale, o.minor.tickvals, undefined, fmt, true));
    } else {
      const x0 = tickFirst(scale, mspec, range);
      minors = tickSequence(mspec, x0, expandRange(range)[1], axrev, maxTicks, 0);
    }
    const canOverlap =
      (o.minor.ticks === 'inside' && o.ticks === 'outside') ||
      (o.minor.ticks === 'outside' && o.ticks === 'inside');
    if (!canOverlap && majors.length > 0 && minors.length > 0) {
      const sorted = majors.map((m) => m.l).sort((a, b) => a - b);
      const eps = (maxRange - minRange) * 1e-9;
      minors = minors.filter((v) => !hasNear(sorted, v, eps));
    }
  }

  if (isPeriod) positionPeriodTicks(majors, spec.definedDelta);

  fmt.inCalcTicks = true;
  fmt.first = tmin;
  fmt.last = majors[majors.length - 1]?.l;
  for (const m of majors) {
    const lastVisibleHead = fmt.prevDateHead;
    const tick = toTick(m.l, fmt.label(m.l, false, m.simpleLabel === true));
    let hide = m.skipLabel === true;
    if (m.periodX !== undefined) {
      // Labels whose period center is outside the range are hidden (and pinned to the edge).
      const p = Math.min(maxRange, Math.max(minRange, m.periodX));
      if (p !== m.periodX) hide = true;
      tick.labelL = p;
    }
    if (hide) {
      tick.text = '';
      // A hidden label must not count as having shown the date head.
      fmt.prevDateHead = lastVisibleHead;
    }
    ticks.push(tick);
  }
  // The leading period tick only carries the label of the period the range starts in.
  if (isPeriod && ticks[0] !== undefined) ticks[0].noTick = true;

  for (const l of minors) ticks.push({ l, text: '', minor: true });
  ticks.push(...minorTicks);
  return ticks;
};
