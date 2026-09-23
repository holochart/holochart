/**
 * Period positioning (plan E3.5): a port of Plotly's `plots/cartesian/align_period.js`.
 *
 * Traces that support it declare, per position axis (`x` shown; `y` likewise):
 *
 * - `xperiod` (`any`, no default): the period length, a number (ms on date axes, data units
 *   otherwise) or `'M<n>'` (n calendar months, date axes only);
 * - `xperiod0` (`any`): a period boundary (date string or ms on date axes, a number otherwise);
 *   coerced only when `xperiod` is set, defaulting as {@link defaultPeriod0};
 * - `xperiodalignment` (`'start' | 'middle' | 'end'`, default `'middle'`): where in its period each
 *   point is drawn; coerced only when `xperiod` is set.
 *
 * The trace's calc step then maps its linear positions through {@link alignPeriod} and keeps the
 * starts/ends for hover (the hovered period) and bar widths.
 */
import {
  EPOCH_2000,
  ONEAVGMONTH,
  ONEDAY,
  ONEWEEK,
  incrementMonth,
  monthStep,
} from './date-math.ts';
import { cleanNumber, dateToMs } from './scale.ts';

/** Where a point sits within its period. */
export type PeriodAlignment = 'start' | 'middle' | 'end';

/** Aligned positions with the bounds of each point's period (all in linear space). */
export interface AlignedPeriods {
  /** Positions to draw at (`starts`, `ends`, or their midpoints, per the alignment). */
  vals: Float64Array;
  /** Start of each point's period. */
  starts: Float64Array;
  /** End of each point's period (the next period's start). */
  ends: Float64Array;
}

/** Options of {@link alignPeriod}. */
export interface AlignPeriodOptions {
  /** The period: a positive number (ms on date axes) or `'M<n>'` on date axes. */
  period: unknown;
  /** A period boundary; defaults to {@link defaultPeriod0}. */
  period0?: unknown;
  /** Default `'middle'` (Plotly's `xperiodalignment` default). */
  alignment?: PeriodAlignment;
  /** Whether the axis is a date axis (positions in ms; months allowed; `period0` parsed as a date). */
  isDate: boolean;
  /** Arrays to write into, reused when each has exactly `values.length` slots. */
  out?: AlignedPeriods;
}

/** A parsed period: a fixed length, or a number of calendar months. */
type Period = { ms: number; months?: undefined } | { ms?: undefined; months: number };

function parsePeriod(period: unknown, isDate: boolean): Period | undefined {
  if (isDate) {
    const months = monthStep(period);
    if (months !== undefined) return { months };
  }
  // Plotly's `isNumeric`: numbers and plain numeric strings.
  const n =
    typeof period === 'number'
      ? period
      : typeof period === 'string' && period.trim() !== ''
        ? Number(period)
        : NaN;
  return Number.isFinite(n) && n > 0 ? { ms: n } : undefined;
}

/**
 * The default `period0`: 2000-01-01 on date axes, or 2000-01-02 (a Sunday) when the period is a
 * whole number of weeks, so weekly periods run Sunday to Sunday; 0 on other axes.
 */
export function defaultPeriod0(period: unknown, isDate: boolean): number {
  if (!isDate) return 0;
  const p = parsePeriod(period, true);
  const weekly = p?.ms !== undefined && p.ms % ONEWEEK === 0;
  return weekly ? EPOCH_2000 + ONEDAY : EPOCH_2000;
}

function outArray(a: Float64Array | undefined, n: number): Float64Array {
  return a !== undefined && a.length === n ? a : new Float64Array(n);
}

/**
 * Snap positions to periods (Plotly's `alignPeriod`): each value moves to the start, middle or end
 * of the period `[start, end)` that contains it, where periods tile the axis from `period0`.
 *
 * Returns `undefined` when `period` is missing or invalid (≤ 0, non-numeric, `'M<n>'` off date
 * axes): positions are then used as they are. Non-finite values give NaN outputs.
 *
 * @example
 * ```ts
 * // Monthly data drawn mid-month:
 * alignPeriod([Date.UTC(2024, 0, 1)], { period: 'M1', isDate: true })!.vals[0]; // 2024-01-16T12:00
 * ```
 */
export function alignPeriod(
  values: ArrayLike<number>,
  opts: AlignPeriodOptions,
): AlignedPeriods | undefined {
  const period = parsePeriod(opts.period, opts.isDate);
  if (period === undefined) return undefined;

  let base = NaN;
  if (opts.period0 !== undefined && opts.period0 !== null) {
    base = opts.isDate ? dateToMs(opts.period0) : cleanNumber(opts.period0);
  }
  if (!Number.isFinite(base)) base = defaultPeriod0(opts.period, opts.isDate);

  const alignment = opts.alignment ?? 'middle';
  const n = values.length;
  const vals = outArray(opts.out?.vals, n);
  const starts = outArray(opts.out?.starts, n);
  const ends = outArray(opts.out?.ends, n);

  for (let i = 0; i < n; i++) {
    const v = values[i] as number;
    let start = NaN;
    let end = NaN;
    if (Number.isFinite(v)) {
      if (period.months !== undefined) {
        const step = period.months;
        // Estimate the period index from the average month length, then walk to the exact
        // boundary after `v` (zero or one step either way in practice; the Julian-vs-Gregorian
        // drift of the estimate only adds steps millennia away from `period0`).
        const k = Math.round((v - base) / (step * ONEAVGMONTH));
        end = incrementMonth(base, step * k);
        while (end > v) end = incrementMonth(end, -step);
        while (end <= v) end = incrementMonth(end, step);
        start = incrementMonth(end, -step);
      } else {
        const p = period.ms;
        // Floor division instead of Plotly's step loops: identical where steps are exact, and it
        // cannot spin when `p` is below the float spacing at `v`.
        start = base + Math.floor((v - base) / p) * p;
        if (start > v) start -= p;
        else if (start + p <= v) start += p;
        end = start + p;
      }
    }
    vals[i] = alignment === 'start' ? start : alignment === 'end' ? end : (start + end) / 2;
    starts[i] = start;
    ends[i] = end;
  }
  return { vals, starts, ends };
}
