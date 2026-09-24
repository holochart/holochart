/**
 * Axis label formatting (plan E3.3, E3.5, E3.7): a port of the label half of Plotly's `axes.js`
 * (`tickText`, `numFormat`, `formatDate`, `formatLog`, `autoTickRound`, `getTickFormat`).
 *
 * Label precision depends on the tick step (`dtick`): a range of 0–10 with ticks every 2 is
 * labelled `4`, while hovering 4.12345 on the same axis shows `4.1235`. So the tick *spec* (the
 * step, anchor and rounding Plotly's `prepTicks` / `autoTicks` compute) lives here too, which keeps
 * `formatValue` self-contained; `ticks.ts` builds on it to place the ticks.
 *
 * On axes with range breaks, the spec and labels are computed in raw space (`rawScale`), as Plotly
 * does; formatters take linear (compressed) values and expand them before formatting.
 *
 * Everything is en-US and UTC: `.` decimal point, `,` thousands, `−` (U+2212) for negatives,
 * d3-time-format in UTC. Locales and display time zones are later stories.
 */
import { format as d3Format } from 'd3-format';
import { utcFormat } from 'd3-time-format';
import type { FullAxis } from '../defaults/types.ts';
import { rawRange, rawScale } from './breaks.ts';
import {
  dateTick0,
  EPOCH_2000,
  HALFDAY,
  mod,
  ONEAVGMONTH,
  ONEAVGQUARTER,
  ONEAVGYEAR,
  ONEDAY,
  ONEHOUR,
  ONEMIN,
  ONEMINMONTH,
  ONEMINQUARTER,
  ONEMINYEAR,
  ONESEC,
  ONEWEEK,
} from './date-math.ts';
import type { AxisType, Scale } from './types.ts';

/** The true minus sign (U+2212) Plotly writes in place of the ASCII hyphen. */
export const MINUS_SIGN = '−';

/** Which labels a `showtickprefix` / `showticksuffix` / `showexponent` applies to. */
export type ShowMode = 'all' | 'first' | 'last' | 'none';
/** How large and small numbers are written (`exponentformat`). */
export type ExponentFormat = 'none' | 'e' | 'E' | 'power' | 'SI' | 'B';
/** Resolved `tickmode` (`sync` behaves as `auto`). */
export type TickMode = 'auto' | 'linear' | 'array';
/**
 * A tick step: a number (linear units, decades on log axes, ms on date axes) or one of the string
 * forms `M<n>` (date: `n` months), `L<f>` (log: linear steps of `f`), `D1` / `D2` (log: every
 * digit / 1, 2 and 5 of each decade).
 */
export type Dtick = number | string;
/**
 * Plotly's `_tickround`: digits after the decimal point for numbers; for dates the smallest field
 * shown (`y`ear, `m`onth, `d`ay, `M`inute, `S`econd) or a number of fractional-second digits;
 * `null` when unused (categories, `D1`/`D2` log steps).
 */
export type TickRound = number | 'y' | 'm' | 'd' | 'M' | 'S' | null;

/** One usable `tickformatstops` entry. */
export interface TickFormatStop {
  dtickrange: readonly [unknown, unknown];
  value: string;
}

/**
 * The tick and label attributes of an axis, validated. Full axes from supply-defaults always have
 * every field; hand-built axes (tests, components) may omit any of them, so each one falls back to
 * its schema default here.
 */
export interface TickOptions {
  /** `'x'` or `'y'`, from the axis `_id`. */
  letter: 'x' | 'y';
  /** Raw `tickmode` (may be undefined on hand-built axes; see {@link resolveTickMode}). */
  tickmode: string | undefined;
  nticks: number;
  tick0: unknown;
  dtick: unknown;
  tickvals: ArrayLike<unknown> | undefined;
  ticktext: ArrayLike<unknown> | undefined;
  tickformat: string;
  /** Enabled, visible stops only. */
  tickformatstops: readonly TickFormatStop[];
  hoverformat: string;
  tickprefix: string;
  showtickprefix: ShowMode;
  ticksuffix: string;
  showticksuffix: ShowMode;
  exponentformat: ExponentFormat;
  showexponent: ShowMode;
  minexponent: number;
  separatethousands: boolean;
  ticklabelmode: 'instant' | 'period';
  ticklabelstep: number;
  /**
   * Log axes with `D1`/`D2` steps: how the ticks between powers of ten are labelled (`small
   * digits`, `complete` or `none`).
   */
  minorloglabels: MinorLogLabels;
  /** `tickfont.size`, default 12. */
  tickfontSize: number;
  ticklabelposition: string;
  side: string;
  ticks: string;
  minor: {
    tickmode: string | undefined;
    nticks: number;
    tick0: unknown;
    dtick: unknown;
    tickvals: ArrayLike<unknown> | undefined;
    ticks: string;
    showgrid: boolean;
  };
}

/**
 * Where and how often ticks go, and how precisely they are labelled (Plotly's `prepTicks` state:
 * `dtick`, `tick0`, `_tickround`, `_tickexponent`, `_definedDelta`).
 */
export interface TickSpec {
  mode: TickMode;
  dtick: Dtick;
  /**
   * Anchor tick in linear space (ms on date axes, an exponent on log axes). For log `L<f>` steps it
   * is in data units, as in Plotly.
   */
  tick0: number;
  /** `dtick` was picked automatically (not given by the user). */
  auto: boolean;
  /** The rough step auto mode rounded from (NaN when `dtick` was given). */
  roughDTick: number;
  tickround: TickRound;
  tickexponent: number;
  /** The tick format in effect: `tickformat`, or the matching `tickformatstops` value. */
  tickformat: string;
  /** Period mode: the period length the tick format implies (e.g. one month for `%b`). */
  definedDelta?: number;
}

/** A formatted label. */
export interface TickLabel {
  text: string;
  /** Multicategory group label. */
  text2?: string;
  /** Font size relative to `tickfont.size` (log axes). */
  fontScale?: number;
}

/** Values of `minorloglabels`. */
export type MinorLogLabels = 'small digits' | 'complete' | 'none';

const SHOW_MODES: readonly ShowMode[] = ['all', 'first', 'last', 'none'];
const MINOR_LOG_LABELS: readonly MinorLogLabels[] = ['small digits', 'complete', 'none'];
const EXPONENT_FORMATS: readonly ExponentFormat[] = ['none', 'e', 'E', 'power', 'SI', 'B'];
const SI_PREFIXES = ['f', 'p', 'n', 'μ', 'm', '', 'k', 'M', 'G', 'T'];

/** Plotly's rounding sets: auto steps are a power of ten times one of these. */
export const ROUND_BASE_10: readonly number[] = [2, 5, 10];
const ROUND_BASE_24: readonly number[] = [1, 2, 3, 6, 12];
const ROUND_BASE_60: readonly number[] = [1, 2, 5, 10, 15, 30];
const ROUND_DAYS: readonly number[] = [1, 2, 3, 7, 14];
/** Day steps with `day of week` range breaks (a 3-day step would wander through the week). */
const ROUND_DAYS_DOW_BREAKS: readonly number[] = [1, 2, 7, 14];
/** log10 of 0.9 (a hair below, for reversed axes), 1 … 10: the `D1` tick positions in a decade. */
export const ROUND_LOG_1: readonly number[] = [
  -0.046, 0, 0.301, 0.477, 0.602, 0.699, 0.778, 0.845, 0.903, 0.954, 1,
];
/** log10 of 0.5, 1, 2, 5, 10: the `D2` tick positions in a decade. */
export const ROUND_LOG_2: readonly number[] = [-0.301, 0, 0.301, 0.699, 1];

/** Largest seconds value shown per number of fractional digits (never round up to `:60`). */
const MAX_SECONDS = [59, 59.9, 59.99, 59.999, 59.9999];

// en-US date formats (Plotly's `locale-en` `_extraFormat`).
const YEAR_FORMAT = '%Y';
const MONTH_FORMAT = '%b %Y';
const DAY_MONTH_FORMAT = '%b %-d';
const DAY_MONTH_YEAR_FORMAT = '%b %-d, %Y';

// ---------------------------------------------------------------------------------------------
// Axis attributes

type Loose = Record<string, unknown>;

function asRecord(v: unknown): Loose {
  return typeof v === 'object' && v !== null ? (v as Loose) : {};
}

function str(v: unknown, dflt: string): string {
  return typeof v === 'string' ? v : dflt;
}

function num(v: unknown, dflt: number, min = -Infinity): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min ? v : dflt;
}

function oneOf<T extends string>(v: unknown, values: readonly T[], dflt: T): T {
  return values.includes(v as T) ? (v as T) : dflt;
}

function isArrayLike(v: unknown): v is ArrayLike<unknown> {
  return Array.isArray(v) || (ArrayBuffer.isView(v) && !(v instanceof DataView));
}

/**
 * Read the tick and label attributes of `axis`, falling back to schema defaults for anything
 * missing or invalid (see {@link TickOptions}).
 */
export function tickOptions(axis: FullAxis): TickOptions {
  const a = axis as unknown as Loose;
  const minor = asRecord(a['minor']);
  const stops: TickFormatStop[] = [];
  const rawStops = a['tickformatstops'];
  if (Array.isArray(rawStops)) {
    for (const s of rawStops) {
      const stop = asRecord(s);
      if (stop['enabled'] === false || stop['visible'] === false) continue;
      const r = Array.isArray(stop['dtickrange']) ? (stop['dtickrange'] as unknown[]) : [];
      stops.push({ dtickrange: [r[0] ?? null, r[1] ?? null], value: str(stop['value'], '') });
    }
  }
  return {
    letter: str(a['_id'], 'x').charAt(0) === 'y' ? 'y' : 'x',
    tickmode: typeof a['tickmode'] === 'string' ? a['tickmode'] : undefined,
    nticks: num(a['nticks'], 0, 0),
    tick0: a['tick0'],
    dtick: a['dtick'],
    tickvals: isArrayLike(a['tickvals']) ? a['tickvals'] : undefined,
    ticktext: isArrayLike(a['ticktext']) ? a['ticktext'] : undefined,
    tickformat: str(a['tickformat'], ''),
    tickformatstops: stops,
    hoverformat: str(a['hoverformat'], ''),
    tickprefix: str(a['tickprefix'], ''),
    showtickprefix: oneOf(a['showtickprefix'], SHOW_MODES, 'all'),
    ticksuffix: str(a['ticksuffix'], ''),
    showticksuffix: oneOf(a['showticksuffix'], SHOW_MODES, 'all'),
    exponentformat: oneOf(a['exponentformat'], EXPONENT_FORMATS, 'B'),
    showexponent: oneOf(a['showexponent'], SHOW_MODES, 'all'),
    minexponent: num(a['minexponent'], 3, 0),
    separatethousands: a['separatethousands'] === true,
    ticklabelmode: a['ticklabelmode'] === 'period' ? 'period' : 'instant',
    ticklabelstep: Math.max(1, Math.round(num(a['ticklabelstep'], 1, 1))),
    minorloglabels: oneOf(a['minorloglabels'], MINOR_LOG_LABELS, 'small digits'),
    tickfontSize: num(asRecord(a['tickfont'])['size'], 12, 1),
    ticklabelposition: str(a['ticklabelposition'], 'outside'),
    side: str(a['side'], ''),
    ticks: str(a['ticks'], ''),
    minor: {
      tickmode: typeof minor['tickmode'] === 'string' ? minor['tickmode'] : undefined,
      nticks: num(minor['nticks'], 5, 0),
      tick0: minor['tick0'],
      dtick: minor['dtick'],
      tickvals: isArrayLike(minor['tickvals']) ? minor['tickvals'] : undefined,
      ticks: str(minor['ticks'], ''),
      showgrid: minor['showgrid'] === true,
    },
  };
}

/**
 * Validate a `dtick` for an axis type (Plotly's `cleanTicks.dtick`), or `undefined` when it is
 * missing or invalid — the caller then falls back to automatic ticks.
 */
export function parseDtick(dtick: unknown, type: AxisType): Dtick | undefined {
  const isDate = type === 'date';
  const isLog = type === 'log';
  let n = NaN;
  if (typeof dtick === 'number') n = dtick;
  else if (typeof dtick === 'string' && dtick.trim() !== '') n = Number(dtick);
  if (Number.isFinite(n)) {
    if (n <= 0) return undefined;
    if (type === 'category' || type === 'multicategory') return Math.max(1, Math.round(n));
    // Date precision is 0.1 ms.
    return isDate ? Math.max(0.1, n) : n;
  }
  if (typeof dtick !== 'string' || !(isDate || isLog)) return undefined;
  const prefix = dtick.charAt(0);
  const rest = dtick.slice(1);
  const f = rest.trim() === '' ? NaN : Number(rest);
  if (!(f > 0) || !Number.isFinite(f)) return undefined;
  if (isDate && prefix === 'M' && Number.isInteger(f)) return `M${f}`;
  if (isLog && prefix === 'L') return `L${f}`;
  if (isLog && prefix === 'D' && (f === 1 || f === 2)) return `D${f}`;
  return undefined;
}

/**
 * The effective tick mode: `sync` behaves as `auto`, and `linear` without a valid `dtick` falls
 * back to `auto`. Without an explicit mode (hand-built axes), `tickvals` imply `array` and a
 * valid `dtick` implies `linear`, as in Plotly's defaults.
 */
export function resolveTickMode(
  tickmode: string | undefined,
  tickvals: ArrayLike<unknown> | undefined,
  dtick: Dtick | undefined,
): TickMode {
  if (tickmode === 'array') return 'array';
  if (tickmode === 'linear') return dtick === undefined ? 'auto' : 'linear';
  if (tickmode !== undefined) return 'auto';
  if (tickvals !== undefined) return 'array';
  return dtick === undefined ? 'auto' : 'linear';
}

// ---------------------------------------------------------------------------------------------
// Tick spec (Plotly's prepTicks / autoTicks / autoTickRound / getTickFormat)

/**
 * Plotly's `Lib.roundUp`: the first element of the sorted `set` greater than `v` (the last one if
 * none is); with `reverse`, the last element less than `v` (the first if none is).
 */
export function roundUp(v: number, set: readonly number[], reverse = false): number {
  let low = 0;
  let high = set.length - 1;
  let c = 0;
  const dlow = reverse ? 0 : 1;
  const dhigh = reverse ? 1 : 0;
  while (low < high && c++ < 100) {
    const mid = reverse ? Math.ceil((low + high) / 2) : Math.floor((low + high) / 2);
    if ((set[mid] as number) <= v) low = mid + dlow;
    else high = mid - dhigh;
  }
  return set[low] as number;
}

function roundDTick(rough: number, base: number, set: readonly number[]): number {
  return base * roundUp(rough / base, set);
}

/** Power of ten at or below `v`, computed exactly as Plotly does (quirks included). */
function base10(v: number): number {
  return Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
}

/** Options for {@link autoTicks}. */
export interface AutoTicksOptions {
  /** Linear range; log axes use it to choose between `L`, `D` and decade steps. */
  range?: readonly [number, number];
  /** Minor ticks: log axes get 1.5× denser steps, date day steps keep tick0 on 2000-01-01. */
  isMinor?: boolean;
  /** The tick format; `%u`, `%V`, `%W` move day-based ticks to Mondays. */
  tickformat?: string;
  /** Date axes with `day of week` range breaks: day steps round to 1, 2, 7 or 14 days. */
  dayOfWeekBreaks?: boolean;
}

/** Result of {@link autoTicks}. */
export interface AutoTicksResult {
  dtick: Dtick;
  /** Linear-space anchor. */
  tick0: number;
  /** Date axes: tick0 was moved to a Sunday/Monday for day-based steps. */
  dayOfWeek?: boolean;
}

/**
 * Plotly's `autoTicks`: round a rough step (linear units per tick) to a "nice" one for the axis
 * type — 1/2/5×10ⁿ for numbers; years, months, days, hours, minutes, seconds for dates; decades,
 * `D1`/`D2` or `L<f>` for log axes; whole categories.
 */
export function autoTicks(
  type: AxisType,
  roughDTick: number,
  options: AutoTicksOptions = {},
): AutoTicksResult {
  let rough = roughDTick;
  let dtick: Dtick;
  let tick0 = 0;
  let dayOfWeek = false;
  if (type === 'date') {
    tick0 = EPOCH_2000;
    // The criteria compare against *half* a unit: precompute twice the rough value.
    const roughX2 = 2 * rough;
    if (roughX2 > ONEAVGYEAR) {
      rough /= ONEAVGYEAR;
      dtick = `M${12 * roundDTick(rough, base10(rough), ROUND_BASE_10)}`;
    } else if (roughX2 > ONEAVGMONTH) {
      rough /= ONEAVGMONTH;
      dtick = `M${roundDTick(rough, 1, ROUND_BASE_24)}`;
    } else if (roughX2 > ONEDAY) {
      dtick = roundDTick(
        rough,
        ONEDAY,
        options.dayOfWeekBreaks === true ? ROUND_DAYS_DOW_BREAKS : ROUND_DAYS,
      );
      if (options.isMinor !== true) {
        // Week ticks on Sundays (Mondays for ISO-week formats). This also moves 2- and 3-day
        // ticks off 2000-01-01, which Plotly accepts as harmless.
        dayOfWeek = true;
        tick0 = dateTick0(/%[uVW]/.test(options.tickformat ?? '') ? 2 : 1);
      }
    } else if (roughX2 > ONEHOUR) {
      dtick = roundDTick(rough, ONEHOUR, ROUND_BASE_24);
    } else if (roughX2 > ONEMIN) {
      dtick = roundDTick(rough, ONEMIN, ROUND_BASE_60);
    } else if (roughX2 > ONESEC) {
      dtick = roundDTick(rough, ONESEC, ROUND_BASE_60);
    } else {
      dtick = roundDTick(rough, base10(rough), ROUND_BASE_10);
    }
  } else if (type === 'log') {
    const r = options.range ?? [0, 1];
    if (options.isMinor === true) rough *= 1.5;
    if (rough > 0.7) {
      // Powers of 10 only.
      dtick = Math.ceil(rough);
    } else if (Math.abs(r[1] - r[0]) < 1) {
      // Less than a decade: linear steps in data units, labelled in full.
      const nt = 1.5 * Math.abs((r[1] - r[0]) / rough);
      rough = Math.abs(Math.pow(10, r[1]) - Math.pow(10, r[0])) / nt;
      dtick = `L${roundDTick(rough, base10(rough), ROUND_BASE_10)}`;
    } else {
      // Intermediate digits between decades, labelled with small digits.
      dtick = rough > 0.3 ? 'D2' : 'D1';
    }
  } else if (type === 'category' || type === 'multicategory') {
    dtick = Math.ceil(Math.max(rough, 1));
  } else {
    dtick = roundDTick(rough, base10(rough), ROUND_BASE_10);
  }
  if (dtick === 0) dtick = 1;
  return dayOfWeek ? { dtick, tick0, dayOfWeek } : { dtick, tick0 };
}

/** The numeric part of a step (`M3` → 3, `L0.5` → 0.5, 2 → 2). */
export function dtickValue(dtick: Dtick): number {
  return typeof dtick === 'number' ? dtick : Number(dtick.slice(1));
}

function isValidDtick(dtick: Dtick | undefined): dtick is Dtick {
  if (dtick === undefined) return false;
  const n = dtickValue(dtick);
  return n > 0 && Number.isFinite(n);
}

function isSIFormat(f: string): boolean {
  return f === 'SI' || f === 'B';
}

function beyondSI(exponent: number): boolean {
  return exponent > 14 || exponent < -15;
}

/** `_tickround` / `_tickexponent` for a numeric step and the largest |value| on the axis. */
function linearRound(
  dtick: number,
  maxend: number,
  exponentformat: string,
  minexponent: number,
): { tickround: number; tickexponent: number } {
  // Two digits past the largest digit of dtick.
  let tickround = 2 - Math.floor(Math.log(dtick) / Math.LN10 + 0.01);
  if (!Number.isFinite(tickround)) tickround = 0;
  let tickexponent = 0;
  const rangeexp = Math.floor(Math.log(maxend) / Math.LN10 + 0.01);
  if (Number.isFinite(rangeexp) && Math.abs(rangeexp) > minexponent) {
    tickexponent =
      isSIFormat(exponentformat) && !beyondSI(rangeexp)
        ? 3 * Math.round((rangeexp - 1) / 3)
        : rangeexp;
  }
  return { tickround, tickexponent };
}

/** Rounding for a number step or `L<f>` over a data-unit range; `null` for `D1`/`D2`. */
function numericRound(
  dtick: Dtick,
  dataRange: readonly [number, number],
  exponentformat: string,
  minexponent: number,
): { tickround: TickRound; tickexponent: number } {
  if (typeof dtick === 'string' && dtick.charAt(0) !== 'L')
    return { tickround: null, tickexponent: 0 };
  const maxend = Math.max(Math.abs(dataRange[0]), Math.abs(dataRange[1]));
  return linearRound(dtickValue(dtick), maxend, exponentformat, minexponent);
}

/** Linear range → data-unit numbers (log: 10^x), as Plotly's `range.map(r2d)`. */
function dataRange(type: AxisType, range: readonly [number, number]): [number, number] {
  return type === 'log' ? [Math.pow(10, range[0]), Math.pow(10, range[1])] : [range[0], range[1]];
}

/** Plotly's `autoTickRound`. */
function autoTickRound(
  scale: Scale,
  o: TickOptions,
  dtick: Dtick,
  tick0: number,
  range: readonly [number, number],
): { tickround: TickRound; tickexponent: number } {
  const type = scale.type;
  if (type === 'category' || type === 'multicategory') return { tickround: null, tickexponent: 0 };
  if (type !== 'date') {
    return numericRound(dtick, dataRange(type, range), o.exponentformat, o.minexponent);
  }
  // Give the rounding a bit more information when tick0 is unusual: the shortest ISO string of
  // tick0 is 10 chars for a date, 16 with minutes, 19 with seconds.
  const tick0str = String(scale.l2r(tick0)).replace(/(^-|i)/g, '');
  const tick0len = tick0str.length;
  let tickround: TickRound;
  if (typeof dtick === 'string') {
    // Any tick0 more specific than a year: always show the full date; otherwise show the month
    // unless ticks are whole years.
    if (tick0len > 10 || tick0str.slice(5) !== '01-01') tickround = 'd';
    else tickround = dtickValue(dtick) % 12 === 0 ? 'y' : 'm';
  } else if ((dtick >= ONEDAY && tick0len <= 10) || dtick >= ONEDAY * 15) tickround = 'd';
  else if ((dtick >= ONEMIN && tick0len <= 16) || dtick >= ONEHOUR) tickround = 'M';
  else if ((dtick >= ONESEC && tick0len <= 19) || dtick >= ONEMIN) tickround = 'S';
  else {
    // Fractional-second digits: of two adjacent ticks at least one has the most digits.
    const tick1len = String(scale.l2r(tick0 + dtick)).replace(/^-/, '').length;
    tickround = Math.max(tick0len, tick1len) - 20;
    if (tickround < 0) tickround = 4;
  }
  return { tickround, tickexponent: 0 };
}

function convertToMs(v: unknown): number {
  return typeof v === 'string' ? Number(v.replace('M', '')) * ONEAVGMONTH : Number(v);
}

function compareLogTicks(left: unknown, right: unknown): number {
  const priority = ['L', 'D'];
  if (typeof left === typeof right) {
    if (typeof left === 'number') return left - (right as number);
    const l = String(left);
    const r = String(right);
    const lp = priority.indexOf(l.charAt(0));
    const rp = priority.indexOf(r.charAt(0));
    if (lp === rp) return Number(l.replace(/(L|D)/g, '')) - Number(r.replace(/(L|D)/g, ''));
    return lp - rp;
  }
  return typeof left === 'number' ? 1 : -1;
}

function isOpenEnd(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

/**
 * The tick format in effect for a step (Plotly's `getTickFormat`): the value of the first enabled
 * `tickformatstops` entry whose `dtickrange` contains `dtick`, else `tickformat`. Date steps
 * compare in ms (`M<n>` as n average months); log steps order `L<f>` before `D1`/`D2` before
 * decade numbers.
 */
export function getTickFormat(o: TickOptions, type: AxisType, dtick: Dtick | undefined): string {
  if (o.tickformatstops.length > 0) {
    for (const stop of o.tickformatstops) {
      const [lo, hi] = stop.dtickrange;
      let ok = false;
      if (type === 'linear' || type === 'date') {
        const d = convertToMs(dtick);
        ok = (isOpenEnd(lo) || convertToMs(lo) <= d) && (isOpenEnd(hi) || convertToMs(hi) >= d);
      } else if (type === 'log') {
        ok =
          (isOpenEnd(lo) || compareLogTicks(dtick, lo) >= 0) &&
          (isOpenEnd(hi) || compareLogTicks(dtick, hi) <= 0);
      }
      if (ok) return stop.value;
    }
  }
  return o.tickformat;
}

/**
 * Plotly's `adjustPeriodDelta`: in period mode, the tick format defines the period (`%b` → a
 * month, `%Y` → a year, …); auto steps shorter than that period grow to it.
 */
function adjustPeriodDelta(
  o: TickOptions,
  dtick: Dtick,
  auto: boolean,
): { dtick: Dtick; definedDelta: number | undefined } {
  const tickformat = getTickFormat(o, 'date', dtick);
  let definedDelta: number | undefined;
  let out = dtick;
  // Fields finer than an hour (%f %L %Q %s %S %M %X) keep the instant.
  if (tickformat && !/%[fLQsSMX]/.test(tickformat)) {
    const ms = typeof dtick === 'number' ? dtick : undefined;
    const months = typeof dtick === 'string' ? dtickValue(dtick) : undefined;
    const grow = (delta: number, minMs: number, minMonths: number, to: Dtick): void => {
      definedDelta = delta;
      if (!auto) return;
      if (ms !== undefined ? ms < minMs : (months as number) < minMonths) out = to;
    };
    if (/%[HI]/.test(tickformat)) grow(ONEHOUR, ONEHOUR, 0, ONEHOUR);
    else if (/%p/.test(tickformat)) grow(HALFDAY, HALFDAY, 0, HALFDAY);
    else if (/%[Aadejuwx]/.test(tickformat)) grow(ONEDAY, ONEDAY, 0, ONEDAY);
    else if (/%[UVW]/.test(tickformat)) grow(ONEWEEK, ONEWEEK, 0, ONEWEEK);
    else if (/%[Bbm]/.test(tickformat)) grow(ONEAVGMONTH, ONEMINMONTH, 1, 'M1');
    else if (/%q/.test(tickformat)) grow(ONEAVGQUARTER, ONEMINQUARTER, 3, 'M3');
    else if (/%[Yy]/.test(tickformat)) grow(ONEAVGYEAR, ONEMINYEAR, 12, 'M12');
  }
  return { dtick: out, definedDelta };
}

/** Options for {@link tickSpec}. */
export interface TickSpecOptions {
  /** Compute the spec of the minor ticks (`minor.*` attributes) instead of the major ones. */
  minor?: boolean;
  /** Linear range to fit the ticks to; default `scale.range`. */
  range?: readonly [number, number];
  /**
   * Round day steps as with `day of week` range breaks (see {@link AutoTicksOptions}). Default:
   * `scale.breaks?.hasDayOfWeek` — pass it explicitly when `scale` is already a `rawScale`.
   */
  dayOfWeekBreaks?: boolean;
  /**
   * Array-mode majors: estimate label precision from 100× more ticks than auto would draw, so
   * `tickvals` without `ticktext` get enough digits (Plotly skips this when minor ticks are
   * auto). Default true.
   */
  arrayPrecision?: boolean;
}

/**
 * Plotly's `prepTicks`: resolve the step (`dtick`), anchor (`tick0`) and label rounding of an
 * axis. Auto mode aims for `nticks` ticks, or one per 80 px (x) / 40 px (y) clamped to 5–10, or one
 * per `1.2 × tickfont.size` px on category axes. Never mutates `axis`.
 *
 * With range breaks, the spec is that of the raw scale (`rawScale`; `options.range` is converted
 * to raw too), so `tick0` and steps are raw values, as in Plotly.
 */
export function tickSpec(scale: Scale, axis: FullAxis, options: TickSpecOptions = {}): TickSpec {
  const breaks = scale.breaks;
  if (breaks !== undefined) {
    const r = options.range;
    return tickSpec(rawScale(scale), axis, {
      ...options,
      range: r === undefined ? undefined : rawRange(breaks, r),
      dayOfWeekBreaks: options.dayOfWeekBreaks ?? breaks.hasDayOfWeek,
    });
  }
  const o = tickOptions(axis);
  const type = scale.type;
  const isMinor = options.minor === true;
  const range = options.range ?? scale.range;
  const src = isMinor ? o.minor : o;
  const userDtick = parseDtick(src.dtick, type);
  const mode = resolveTickMode(src.tickmode, src.tickvals, userDtick);
  let dtick: Dtick | undefined = mode === 'linear' ? userDtick : undefined;
  let tick0: number | undefined;
  let auto = false;
  let roughDTick = NaN;
  let dayOfWeek = false;
  if (dtick !== undefined) {
    tick0 = parseTick0(scale, src.tick0, dtick);
  } else {
    auto = true;
    let nt = src.nticks;
    if (!nt) {
      if (type === 'category' || type === 'multicategory') {
        nt = scale.length / Math.round(1.2 * o.tickfontSize);
      } else {
        const minPx = o.letter === 'y' ? 40 : 80;
        nt = Math.min(9, Math.max(4, scale.length / minPx)) + 1;
      }
    }
    if (!isMinor && mode === 'array' && options.arrayPrecision !== false) nt *= 100;
    roughDTick = Math.abs(range[1] - range[0]) / nt;
    if (roughDTick > 0 && Number.isFinite(roughDTick)) {
      const r = autoTicks(type, roughDTick, {
        range,
        isMinor,
        tickformat: getTickFormat(o, type, userDtick),
        dayOfWeekBreaks: options.dayOfWeekBreaks === true,
      });
      dtick = r.dtick;
      tick0 = r.tick0;
      dayOfWeek = r.dayOfWeek === true;
    }
    if (!isValidDtick(dtick)) {
      // Zero-length or non-finite range: any step will do, one tick at most is visible.
      dtick = type === 'date' ? ONEDAY : 1;
      tick0 = undefined;
    }
  }
  let definedDelta: number | undefined;
  if (!isMinor && type === 'date' && o.ticklabelmode === 'period') {
    ({ dtick, definedDelta } = adjustPeriodDelta(o, dtick, auto));
    // Month steps don't need the Sunday/Monday tweak.
    if (typeof dtick === 'string' && dayOfWeek) tick0 = EPOCH_2000;
  }
  tick0 ??= type === 'date' ? EPOCH_2000 : 0;
  // Never step below the 0.1 ms date precision.
  if (type === 'date' && typeof dtick === 'number' && dtick < 0.1) dtick = 0.1;
  const { tickround, tickexponent } = autoTickRound(scale, o, dtick, tick0, range);
  const spec: TickSpec = {
    mode,
    dtick,
    tick0,
    auto,
    roughDTick,
    tickround,
    tickexponent,
    tickformat: getTickFormat(o, type, dtick),
  };
  if (definedDelta !== undefined) spec.definedDelta = definedDelta;
  return spec;
}

/**
 * A user `tick0` in linear space (Plotly's `cleanTicks.tick0`), or `undefined` for the default:
 * 2000-01-01 on date axes (the Sunday after it for whole-week steps), 0 otherwise. `D1`/`D2` log
 * steps ignore tick0.
 */
function parseTick0(scale: Scale, tick0: unknown, dtick: Dtick): number | undefined {
  if (dtick === 'D1' || dtick === 'D2') return undefined;
  const l = tick0 === undefined || tick0 === null || tick0 === '' ? NaN : scale.r2l(tick0);
  if (Number.isFinite(l)) return l;
  if (scale.type === 'date') {
    return dateTick0(typeof dtick === 'number' && dtick % ONEWEEK === 0 ? 1 : 0);
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Numbers

const numberFormats = new Map<string, ((n: number) => string) | null>();

function d3NumberFormat(specifier: string): ((n: number) => string) | null {
  let f = numberFormats.get(specifier);
  if (f === undefined) {
    try {
      f = d3Format(specifier);
    } catch {
      // Invalid specifier: Plotly warns and prints the raw number.
      f = null;
    }
    numberFormats.set(specifier, f);
  }
  return f;
}

/**
 * Plotly's `numSeparate` for en-US: thousands separators when the number has more than four
 * integer digits (so years stay `2024`), a decimal part, or `separatethousands`.
 */
function numSeparate(value: string, separatethousands: boolean): string {
  const thousands = /(\d+)(\d{3})/;
  const parts = value.split('.');
  let x1 = parts[0] as string;
  const x2 = parts.length > 1 ? `.${parts[1] as string}` : '';
  if (parts.length > 1 || x1.length > 4 || separatethousands) {
    while (thousands.test(x1)) x1 = x1.replace(thousands, '$1,$2');
  }
  return x1 + x2;
}

/** Options for {@link formatNumber}. */
export interface NumberFormatOptions {
  /** A d3-format specifier; when set, it alone decides the output. */
  tickformat?: string;
  /** Default `B`. */
  exponentformat?: ExponentFormat;
  /** Default 3. */
  minexponent?: number;
  separatethousands?: boolean;
  /**
   * Digits after the decimal point. Default: derived from the value itself with 4 extra digits
   * (Plotly's hover precision), which also picks the exponent.
   */
  tickround?: number;
  /** Common exponent to factor out (SI prefix, `e+6`, …). Default 0, or derived with `tickround`. */
  tickexponent?: number;
  /** Factor out the exponent but don't print it (`showexponent` first/last on other ticks). */
  hideExponent?: boolean;
}

/**
 * Format a number like Plotly's `numFormat`: fixed precision, a common exponent written per
 * `exponentformat` (`1.5M`, `1.5B`, `1.5e+6`, `1.5×10<sup>6</sup>`), thousands separators and a
 * true minus sign.
 *
 * @example
 * ```ts
 * formatNumber(-1234.5);                          // '−1,234.5'
 * formatNumber(2e9);                              // '2B'
 * formatNumber(0.25, { tickformat: '.1%' });      // '25.0%'
 * ```
 */
export function formatNumber(v: number, options: NumberFormatOptions = {}): string {
  if (options.tickformat) {
    const f = d3NumberFormat(options.tickformat);
    return (f ? f(v) : String(v)).replace(/-/g, MINUS_SIGN);
  }
  const minexponent = options.minexponent ?? 3;
  let exponentFormat: string =
    options.hideExponent === true ? 'hide' : (options.exponentformat ?? 'B');
  let tickRound: number;
  let exponent: number;
  if (options.tickround === undefined) {
    const abs = Math.abs(v) || 1;
    const r = linearRound(abs, abs, options.exponentformat ?? 'B', minexponent);
    tickRound = r.tickround + 4;
    exponent = r.tickexponent;
  } else {
    tickRound = options.tickround;
    exponent = options.tickexponent ?? 0;
  }
  // Rounding increment.
  const e = Math.pow(10, -tickRound) / 2;
  if (options.exponentformat === 'none') exponent = 0;

  // Take the sign out and put it back at the end: fewer cases.
  let isNeg = v < 0;
  let a = Math.abs(v);
  let s: string;
  if (a < e) {
    // Zero is just zero (it may still get an exponent below).
    s = '0';
    isNeg = false;
  } else {
    a += e;
    if (exponent) {
      a *= Math.pow(10, -exponent);
      tickRound += exponent;
    }
    if (tickRound === 0) s = String(Math.floor(a));
    else if (tickRound < 0) {
      s = String(Math.round(a));
      s = s.slice(0, Math.max(0, s.length + tickRound));
      for (let i = tickRound; i < 0; i++) s += '0';
    } else {
      s = String(a);
      const dp = s.indexOf('.') + 1;
      if (dp) s = s.slice(0, dp + tickRound).replace(/\.?0+$/, '');
    }
    s = numSeparate(s, options.separatethousands === true);
  }

  if (exponent && exponentFormat !== 'hide') {
    if (isSIFormat(exponentFormat) && beyondSI(exponent)) exponentFormat = 'power';
    let signed: string;
    if (exponent < 0) signed = MINUS_SIGN + String(-exponent);
    else if (exponentFormat !== 'power') signed = `+${exponent}`;
    else signed = String(exponent);
    if (exponentFormat === 'e' || exponentFormat === 'E') s += exponentFormat + signed;
    else if (exponentFormat === 'power') s += `×10<sup>${signed}</sup>`;
    else if (exponentFormat === 'B' && exponent === 9) s += 'B';
    else s += SI_PREFIXES[exponent / 3 + 5] ?? '';
  }
  return isNeg ? MINUS_SIGN + s : s;
}

// ---------------------------------------------------------------------------------------------
// Dates

const timeFormats = new Map<string, (d: Date) => string>();

function d3TimeFormat(specifier: string): (d: Date) => string {
  let f = timeFormats.get(specifier);
  if (f === undefined) {
    f = utcFormat(specifier);
    timeFormats.set(specifier, f);
  }
  return f;
}

function lpad(v: number, len: number): string {
  return String(v).padStart(len, '0');
}

/**
 * Apply a d3-time-format specifier in UTC, plus Plotly's extensions: `%{n}f` (or `%nf`) for `n`
 * digits of fractional seconds (`%f` alone: up to 6, trailing zeros dropped) and `%h` for the half
 * year (1 or 2).
 */
function modDateFormat(fmt: string, x: number): string {
  const d = new Date(Math.floor(x + 0.05));
  const f = fmt
    .replace(/%(?:\{(\d+)\}|(\d))?f/g, (_m, braced?: string, bare?: string) => {
      const digits = Math.min(Number(braced ?? bare) || 6, 6);
      const frac = mod(x / 1000, 1) + 2;
      return frac.toFixed(digits).slice(2).replace(/0+$/, '') || '0';
    })
    .replace(/%h/g, () => (d.getUTCMonth() < 6 ? '1' : '2'));
  return d3TimeFormat(f)(d);
}

/** `HH:MM[:SS[.fff]]` of a date (Plotly's `formatTime`). */
function formatTime(x: number, tr: TickRound): string {
  const timePart = mod(x + 0.05, ONEDAY);
  let s = `${lpad(Math.floor(timePart / ONEHOUR), 2)}:${lpad(mod(Math.floor(timePart / ONEMIN), 60), 2)}`;
  if (tr !== 'M') {
    const digits = typeof tr === 'number' ? Math.min(4, Math.max(0, Math.round(tr))) : 0;
    // Seconds round (they have a decimal point) but never up to :60.
    const sec = Math.min(mod(x / ONESEC, 60), MAX_SECONDS[digits] as number);
    let secStr = (100 + sec).toFixed(digits).slice(1);
    if (digits > 0) secStr = secStr.replace(/0+$/, '').replace(/[.]$/, '');
    s += `:${secStr}`;
  }
  return s;
}

/**
 * Format a date (UTC ms) with `format`, or — when `format` is empty — Plotly's default for the
 * rounding level: `2024` (`y`), `Mar 2024` (`m`), `Mar 5\n2024` (`d`), `12:30\nMar 5, 2024` (`M`),
 * `12:30:05\n…` (`S`), `12:30:05.25\n…` (digits). The part after `\n` is the "head" that
 * multi-level tick labels show on a second line.
 */
export function formatDateLabel(ms: number, format: string, tickround: TickRound): string {
  if (format) return modDateFormat(format, ms);
  if (tickround === 'y') return modDateFormat(YEAR_FORMAT, ms);
  if (tickround === 'm') return modDateFormat(MONTH_FORMAT, ms);
  if (tickround === 'd') {
    return `${modDateFormat(DAY_MONTH_FORMAT, ms)}\n${modDateFormat(YEAR_FORMAT, ms)}`;
  }
  return `${formatTime(ms, tickround)}\n${modDateFormat(DAY_MONTH_YEAR_FORMAT, ms)}`;
}

// Extra precision (hover, array ticks without text) shows one more field.
const NEXT_ROUND: Record<string, TickRound> = { y: 'm', m: 'd', d: 'M', M: 'S', S: 4 };

// ---------------------------------------------------------------------------------------------
// Labels

/**
 * Labels values of one axis (Plotly's `tickText`). Stateful across a tick pass: multi-level date
 * labels repeat their head (year, or full date under times) only when it changes, which needs the
 * previous head.
 */
export interface TickFormatter {
  /**
   * Label the value `l` (linear space; on rangebreaks axes the compressed value, expanded to raw
   * before formatting). `hover` gives the one-line hover form with extra precision;
   * `noSuffixPrefix` leaves out `tickprefix` / `ticksuffix`.
   */
  label(l: number, hover?: boolean, noSuffixPrefix?: boolean): TickLabel;
  /** First / last major tick (linear space), for `show*: 'first' | 'last'`. */
  first: number | undefined;
  last: number | undefined;
  /** Head of the last date label that showed one (Plotly `_prevDateHead`). */
  prevDateHead: string;
  /** In a tick pass: repeat date heads only when they change. */
  inCalcTicks: boolean;
}

/**
 * Create the label formatter of an axis for a tick spec (default: the axis' current auto spec).
 * On rangebreaks axes it formats on the raw scale and takes linear (compressed) values, so hover
 * and tick callers need no conversion.
 */
export function createTickFormatter(
  scale: Scale,
  axis: FullAxis,
  spec: TickSpec = tickSpec(scale, axis),
): TickFormatter {
  const breaks = scale.breaks;
  if (breaks === undefined) return rawTickFormatter(scale, axis, spec);
  const inner = rawTickFormatter(rawScale(scale), axis, spec);
  let first: number | undefined;
  let last: number | undefined;
  return {
    label: (l, hover, noSuffixPrefix) => inner.label(breaks.toRaw(l), hover, noSuffixPrefix),
    get first() {
      return first;
    },
    set first(l) {
      first = l;
      inner.first = l === undefined ? undefined : breaks.toRaw(l);
    },
    get last() {
      return last;
    },
    set last(l) {
      last = l;
      inner.last = l === undefined ? undefined : breaks.toRaw(l);
    },
    get prevDateHead() {
      return inner.prevDateHead;
    },
    set prevDateHead(v) {
      inner.prevDateHead = v;
    },
    get inCalcTicks() {
      return inner.inCalcTicks;
    },
    set inCalcTicks(v) {
      inner.inCalcTicks = v;
    },
  };
}

/** The formatter of a scale without breaks (values are formatted as they are). */
function rawTickFormatter(scale: Scale, axis: FullAxis, spec: TickSpec): TickFormatter {
  const o = tickOptions(axis);
  const type = scale.type;

  const numFormat = (
    v: number,
    hideexp: string,
    hover: boolean,
    useHoverFormat: boolean,
  ): string => {
    let tickround = Number(spec.tickround) || 0;
    let tickexponent = spec.tickexponent;
    let tickformat = spec.tickformat;
    if (hover) {
      // Set the exponent for this value alone and add 4 digits over the tick labels; without
      // exponents on the axis, keep the axis' exponent.
      const r =
        o.showexponent === 'none'
          ? numericRound(spec.dtick, dataRange(type, scale.range), o.exponentformat, o.minexponent)
          : linearRound(Math.abs(v) || 1, Math.abs(v) || 1, o.exponentformat, o.minexponent);
      tickround = (Number(r.tickround) || 0) + 4;
      tickexponent = r.tickexponent;
      if (useHoverFormat && o.hoverformat) tickformat = o.hoverformat;
    }
    return formatNumber(v, {
      tickformat,
      exponentformat: o.exponentformat,
      minexponent: o.minexponent,
      separatethousands: o.separatethousands,
      tickround,
      tickexponent,
      hideExponent: hideexp === 'hide',
    });
  };

  const formatLinear = (x: number, hover: boolean, extra: boolean, hideexp: string): string => {
    let h = hideexp;
    if (h === 'never') h = '';
    else if (o.showexponent === 'all' && Math.abs(x / dtickValue(spec.dtick)) < 1e-6) {
      // No exponent on zero when every label shows one: only first/last would want it there.
      h = 'hide';
    }
    return numFormat(x, h, extra, hover || extra);
  };

  const formatLog = (x: number, extra: boolean, hideexp: string): TickLabel => {
    let dtick = spec.dtick;
    let c0 = typeof dtick === 'string' ? dtick.charAt(0) : '';
    // Hover must never hide the exponent: that could misstate the value by orders of magnitude.
    const h = hideexp === 'never' ? '' : hideexp;
    if (extra && c0 !== 'L') {
      dtick = 'L3';
      c0 = 'L';
    }
    if (spec.tickformat || c0 === 'L') {
      return { text: numFormat(Math.pow(10, x), h, extra, true) };
    }
    if (typeof dtick === 'number' || mod(x + 0.01, 1) < 0.1) {
      const p = Math.round(x);
      const absP = Math.abs(p);
      const ef = o.exponentformat;
      if (ef === 'power' || (isSIFormat(ef) && beyondSI(p))) {
        let text: string;
        if (p === 0) text = '1';
        else if (p === 1) text = '10';
        else text = `10<sup>${p > 1 ? '' : MINUS_SIGN}${absP}</sup>`;
        return { text, fontScale: 1.25 };
      }
      if ((ef === 'e' || ef === 'E') && absP > 2) {
        return { text: `1${ef}${p > 0 ? '+' : MINUS_SIGN}${absP}` };
      }
      return { text: numFormat(Math.pow(10, x), '', true, false) };
    }
    // D1/D2 in-between ticks (`minorloglabels`): a small digit (Plotly's default), the full
    // value like the powers of ten, or nothing.
    if (o.minorloglabels === 'none') return { text: '' };
    if (o.minorloglabels === 'complete') {
      // Written like the powers of ten around it: 2×10³ next to 10³, 2e+3 next to 1e+3.
      const p = Math.floor(x + 0.01);
      const digit = Math.round(Math.pow(10, mod(x, 1)));
      const absP = Math.abs(p);
      const ef = o.exponentformat;
      const sign = p > 0 ? '' : MINUS_SIGN;
      if ((ef === 'power' || (isSIFormat(ef) && beyondSI(p))) && absP > 1) {
        return { text: `${digit}×10<sup>${sign}${absP}</sup>` };
      }
      if ((ef === 'e' || ef === 'E') && absP > 2) {
        return { text: `${digit}${ef}${p > 0 ? '+' : MINUS_SIGN}${absP}` };
      }
      return { text: numFormat(Math.pow(10, x), '', true, false) };
    }
    return { text: String(Math.round(Math.pow(10, mod(x, 1)))), fontScale: 0.75 };
  };

  const formatDate = (x: number, hover: boolean, extraPrecision: boolean): string => {
    let tr = spec.tickround;
    const fmt = (hover && o.hoverformat) || spec.tickformat;
    // Extra precision only when no explicit format was given.
    const extra = !fmt && extraPrecision;
    if (extra) tr = typeof tr === 'number' ? 4 : (NEXT_ROUND[String(tr)] ?? 4);
    let dateStr = formatDateLabel(x, fmt, tr);
    let headStr: string | undefined;
    const split = dateStr.indexOf('\n');
    if (split !== -1) {
      headStr = dateStr.slice(split + 1);
      dateStr = dateStr.slice(0, split);
    }
    if (extra) {
      // Strip trailing zeros the extra precision introduced.
      if (headStr !== undefined && (dateStr === '00:00:00' || dateStr === '00:00')) {
        dateStr = headStr;
        headStr = '';
      } else if (dateStr.length === 8) {
        // Drop zero seconds (never the minutes).
        dateStr = dateStr.replace(/:00$/, '');
      }
    }
    if (headStr) {
      if (hover) {
        // One line, head first — except a year head, which reads better last: "Jan 5, 2026".
        if (tr === 'd') dateStr += `, ${headStr}`;
        else dateStr = headStr + (dateStr ? `, ${dateStr}` : '');
      } else if (!formatter.inCalcTicks || formatter.prevDateHead !== headStr) {
        formatter.prevDateHead = headStr;
        dateStr += `<br>${headStr}`;
      } else {
        // Keep labels vertically aligned where the second line would push the first one.
        const inside = o.ticklabelposition.includes('inside');
        if ((!inside && o.side === 'top') || (inside && o.side === 'bottom')) dateStr += '<br> ';
      }
    }
    return dateStr;
  };

  const formatter: TickFormatter = {
    first: undefined,
    last: undefined,
    prevDateHead: '',
    inCalcTicks: false,
    label(x, hover = false, noSuffixPrefix = false) {
      const arrayMode = spec.mode === 'array';
      const extra = hover || arrayMode;
      if (arrayMode && o.ticktext !== undefined && o.tickvals !== undefined) {
        const minDiff = Math.abs(scale.range[1] - scale.range[0]) / 10000;
        for (let i = 0; i < o.ticktext.length; i++) {
          if (Math.abs(x - scale.d2l(o.tickvals[i])) < minDiff) {
            return { text: String(o.ticktext[i]) };
          }
        }
      }
      const isHidden = (show: ShowMode): boolean => {
        if (hover) return show === 'none';
        if (show === 'all') return false;
        const edge =
          show === 'first' ? formatter.first : show === 'last' ? formatter.last : undefined;
        return x !== edge;
      };
      const hideexp = hover
        ? 'never'
        : o.exponentformat !== 'none' && isHidden(o.showexponent)
          ? 'hide'
          : '';
      let out: TickLabel;
      if (type === 'date') out = { text: formatDate(x, hover, extra) };
      else if (type === 'log') out = formatLog(x, extra, hideexp);
      else if (type === 'category') out = { text: scale.categories[Math.round(x)] ?? '' };
      else if (type === 'multicategory') {
        const [group = '', item = ''] = scale.multicategories[Math.round(x)] ?? [];
        out = hover ? { text: `${group} - ${item}` } : { text: item, text2: group };
      } else out = { text: formatLinear(x, hover, extra, hideexp) };
      if (!noSuffixPrefix) {
        if (o.tickprefix && !isHidden(o.showtickprefix)) out.text = o.tickprefix + out.text;
        if (o.ticksuffix && !isHidden(o.showticksuffix)) out.text += o.ticksuffix;
      }
      return out;
    },
  };
  return formatter;
}

/**
 * Format one value of an axis for display — the hover-label helper (Plotly's `hoverLabelText` /
 * `tickText(ax, x, 'hover')`). With `forHover`, uses `hoverformat` (else the tick format with
 * extra precision: `4.1235`, `Jan 5, 2026, 12:30`), writes date heads on the same line and never
 * hides the exponent; without, gives the tick label of `l`. Non-finite values give `''`. On
 * rangebreaks axes `l` is the compressed linear value (as from `d2l`); it is expanded first.
 *
 * `spec` defaults to the axis' current tick spec; pass the one from a tick pass to skip
 * recomputing it.
 */
export function formatValue(
  scale: Scale,
  axis: FullAxis,
  l: number,
  forHover: boolean,
  spec?: TickSpec,
): string {
  if (!Number.isFinite(l)) return '';
  return createTickFormatter(scale, axis, spec).label(l, forHover).text;
}
