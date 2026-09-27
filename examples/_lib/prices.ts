import { gaussian, rng } from './rng.ts';

/** A daily (or intraday) price series: dates and open, high, low, close and volume per bar. */
export interface PriceSeries {
  x: string[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
}

export interface PriceOptions {
  /** PRNG seed: the same seed gives the same series. */
  seed: number;
  /** Number of bars. */
  bars: number;
  /** First bar, as a UTC date (`'2024-01-02'`) or date-time (`'2024-01-02 09:30'`). */
  start: string;
  /** Minutes between bars (default: one day). */
  minutes?: number;
  /** Price of the first open. Default 100. */
  price?: number;
  /** Daily volatility of the close-to-close return. Default 0.018. */
  volatility?: number;
  /** Drift per bar. Default 0.0006. */
  drift?: number;
  /** Keep only the bars of weekdays not listed in `holidays` (a trading calendar). Default true. */
  tradingDays?: boolean;
  /** Dates (`'2024-07-04'`) without trading. */
  holidays?: readonly string[];
  /** Keep only bars from `session[0]` to `session[1]` o'clock (UTC), for intraday series. */
  session?: readonly [number, number];
}

const DAY = 86_400_000;

/** A US-style holiday calendar for 2024 (the NYSE's full-day closures). */
export const HOLIDAYS_2024 = [
  '2024-01-01',
  '2024-01-15',
  '2024-02-19',
  '2024-03-29',
  '2024-05-27',
  '2024-06-19',
  '2024-07-04',
  '2024-09-02',
  '2024-11-28',
  '2024-12-25',
] as const;

const round = (v: number): number => Math.round(v * 100) / 100;

/**
 * A deterministic geometric random walk of OHLC bars with volume (examples and visual baselines
 * must not change between runs): each bar opens near the previous close, closes after a normal
 * return, and reaches a high and low beyond both by a random wick. Volume grows with the size of
 * the move.
 */
export function priceSeries(options: PriceOptions): PriceSeries {
  const normal = gaussian(rng(options.seed));
  const step = (options.minutes ?? 24 * 60) * 60_000;
  const vol = options.volatility ?? 0.018;
  const drift = options.drift ?? 0.0006;
  const holidays = new Set(options.holidays ?? []);
  const trading = options.tradingDays ?? true;
  const out: PriceSeries = { x: [], open: [], high: [], low: [], close: [], volume: [] };
  let close = options.price ?? 100;
  const intraday = step < DAY;
  const start =
    options.start.length > 10 ? options.start.replace(' ', 'T') : `${options.start}T00:00`;
  let t = Date.parse(`${start}:00Z`);
  while (out.x.length < options.bars) {
    const date = new Date(t);
    const iso = date.toISOString();
    const weekday = date.getUTCDay();
    const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
    const open = !trading || (weekday !== 0 && weekday !== 6 && !holidays.has(iso.slice(0, 10)));
    const inSession = !options.session || (hour >= options.session[0] && hour < options.session[1]);
    t += step;
    if (!open || !inSession) continue;
    const scale = intraday ? Math.sqrt(step / (6.5 * 3_600_000)) : 1;
    const o = close * (1 + normal() * vol * 0.25 * scale);
    const c = o * (1 + drift * scale + normal() * vol * scale);
    const wick = () => Math.abs(normal()) * vol * 0.45 * scale;
    const h = Math.max(o, c) * (1 + wick());
    const l = Math.min(o, c) * (1 - wick());
    close = c;
    out.x.push(intraday ? iso.slice(0, 16).replace('T', ' ') : iso.slice(0, 10));
    out.open.push(round(o));
    out.high.push(round(h));
    out.low.push(round(l));
    out.close.push(round(c));
    const move = Math.abs(c / o - 1) / (vol * scale);
    out.volume.push(Math.round(1e6 * (0.6 + 0.5 * move + 0.3 * Math.abs(normal()))));
  }
  return out;
}

/** The simple moving average of `values` over `n` bars (`null` until `n` bars exist). */
export function movingAverage(values: readonly number[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= n) sum -= values[i - n]!;
    out.push(i >= n - 1 ? Math.round((sum / n) * 100) / 100 : null);
  }
  return out;
}
