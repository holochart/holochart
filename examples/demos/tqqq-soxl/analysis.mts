/**
 * Shared data and analysis for the TQQQ and SOXL demo (docs page `demos/tqqq-soxl`): daily
 * total-return prices since inception, recent daily and intraday OHLCV, the funds' holdings, and
 * the statistics the charts draw from them (returns, drawdowns, volatility, calendar returns,
 * per-year figures, and the volatility-decay model of a daily-rebalanced 3× fund).
 *
 * Pure and DOM-free, so the docs page can import it during server-side rendering. A `.mts` file
 * on purpose: the example registry treats every `.ts` file under `examples/` as an example.
 */
import daily from './data/daily.json';
import holdingsJson from './data/holdings.json';
import intradayJson from './data/intraday.json';

/* ---------------------------------------------------------------------------------------------- */
/* Tickers                                                                                        */
/* ---------------------------------------------------------------------------------------------- */

/** The two 3× funds. */
export type Fund = 'TQQQ' | 'SOXL';
/** The unleveraged ETFs that track the same indexes. */
export type Reference = 'QQQ' | 'SOXX';
export type Ticker = Fund | Reference;

export const FUNDS: readonly Fund[] = ['TQQQ', 'SOXL'];
export const REFERENCES: readonly Reference[] = ['QQQ', 'SOXX'];
export const TICKERS: readonly Ticker[] = ['TQQQ', 'QQQ', 'SOXL', 'SOXX'];

/** The unleveraged ETF on the same index as each fund. */
export const UNDERLYING: Readonly<Record<Fund, Reference>> = { TQQQ: 'QQQ', SOXL: 'SOXX' };

/** The index each fund is 3× of. */
export const INDEX: Readonly<Record<Fund, string>> = {
  TQQQ: 'Nasdaq-100',
  SOXL: 'ICE Semiconductor Index',
};

export const NAMES: Readonly<Record<Ticker, string>> = {
  TQQQ: 'ProShares UltraPro QQQ',
  SOXL: 'Direxion Daily Semiconductor Bull 3X',
  QQQ: 'Invesco QQQ Trust',
  SOXX: 'iShares Semiconductor ETF',
};

/**
 * One hue per index family, so a fund and its unleveraged reference read as a pair: the 3× fund
 * solid and full strength, the reference dashed and lighter (composite encoding, never color
 * alone). Blue and orange pass the dataviz palette checks on the default dark background.
 */
export const COLOR: Readonly<Record<Ticker, string>> = {
  TQQQ: '#5e74d5',
  QQQ: '#9ba8e4',
  SOXL: '#cc540a',
  SOXX: '#e8a070',
};
/** Line dash per ticker: the references are dashed. */
export const DASH: Readonly<Record<Ticker, string>> = {
  TQQQ: 'solid',
  QQQ: 'dash',
  SOXL: 'solid',
  SOXX: 'dash',
};
/** Rising and falling (the default template's emerald and red), and the diverging midpoint. */
export const UP = '#118e36';
export const DOWN = '#ea2a37';
export const NEUTRAL = '#4b475c';
/** Red → neutral → green, for signed returns (heatmaps, contours). */
export const RETURN_SCALE: [number, string][] = [
  [0, DOWN],
  [0.5, NEUTRAL],
  [1, UP],
];

/* ---------------------------------------------------------------------------------------------- */
/* Data                                                                                           */
/* ---------------------------------------------------------------------------------------------- */

/** Retrieval date of the data, `YYYY-MM-DD`. */
export const RETRIEVED: string = daily.retrieved;
/** The shared trading calendar, `YYYY-MM-DD`, from TQQQ's first day. */
export const CALENDAR: readonly string[] = daily.date;
/** Last trading day in the data. */
export const LAST_DATE: string = CALENDAR[CALENDAR.length - 1] as string;

export interface Series {
  ticker: Ticker;
  /** Trading days, `YYYY-MM-DD`. */
  dates: readonly string[];
  /** Split- and dividend-adjusted close (a total-return price). */
  adj: readonly number[];
}

function series(ticker: Ticker): Series {
  const src: { start: number; adjClose: number[] } =
    ticker === 'TQQQ' || ticker === 'SOXL' ? daily.funds[ticker] : daily.references[ticker];
  return { ticker, dates: CALENDAR.slice(src.start), adj: src.adjClose };
}

/** Total-return prices of every ticker over its own history (from TQQQ's first day for QQQ/SOXX). */
export const SERIES: Readonly<Record<Ticker, Series>> = {
  TQQQ: series('TQQQ'),
  QQQ: series('QQQ'),
  SOXL: series('SOXL'),
  SOXX: series('SOXX'),
};

/** First day both funds traded (SOXL's inception): the common start of comparisons. */
export const COMMON_START: string = SERIES.SOXL.dates[0] as string;

/** Stock splits as `[date, 'n:1']`. */
export const SPLITS: Readonly<Record<Fund, readonly [string, string][]>> = {
  TQQQ: daily.funds.TQQQ.splits as [string, string][],
  SOXL: daily.funds.SOXL.splits as [string, string][],
};

export interface Ohlcv {
  date: readonly string[];
  open: readonly number[];
  high: readonly number[];
  low: readonly number[];
  close: readonly number[];
  volume: readonly number[];
}

/** Daily OHLCV since 2024-10-01 (split-adjusted, not dividend-adjusted). */
export const OHLCV: Readonly<Record<Fund, Ohlcv>> = {
  TQQQ: daily.funds.TQQQ.ohlcv,
  SOXL: daily.funds.SOXL.ohlcv,
};

export interface Intraday {
  /** Bar start, exchange time (New York), `YYYY-MM-DD HH:MM`. */
  time: readonly string[];
  open: readonly number[];
  high: readonly number[];
  low: readonly number[];
  close: readonly number[];
  volume: readonly number[];
  /** Close of the session before the first bar. */
  previousClose: number;
}

/** 5-minute bars of the last five sessions, regular hours only. */
export const INTRADAY: Readonly<Record<Fund, Intraday>> = {
  TQQQ: intradayJson.funds.TQQQ,
  SOXL: intradayJson.funds.SOXL,
};

export type HoldingKind = 'stock' | 'swap' | 'future' | 'tbill' | 'cash' | 'other';

export interface Holding {
  kind: HoldingKind;
  /** Company name, swap counterparty, or instrument description. */
  name: string;
  ticker?: string;
  /** Market value in USD (stocks, T-bills, cash, other assets). */
  value?: number;
  /** Index exposure in USD: notional for swaps and futures, market value for stocks. */
  exposure?: number;
}

export interface FundHoldings {
  /** Date of the holdings file. */
  asOf: string;
  /** Net assets in USD. */
  netAssets: number;
  index: string;
  source: string;
  holdings: readonly Holding[];
}

export const HOLDINGS: Readonly<Record<Fund, FundHoldings>> = {
  TQQQ: holdingsJson.TQQQ as FundHoldings,
  SOXL: holdingsJson.SOXL as FundHoldings,
};

/** Display names of the holding kinds. */
export const KIND_NAME: Readonly<Record<HoldingKind, string>> = {
  stock: 'Stocks',
  swap: 'Total return swaps',
  future: 'Index futures',
  tbill: 'Treasury bills',
  cash: 'Cash and money market',
  other: 'Other net assets',
};

/* ---------------------------------------------------------------------------------------------- */
/* Returns                                                                                        */
/* ---------------------------------------------------------------------------------------------- */

export interface Returns {
  /** The day each return ends on. */
  dates: readonly string[];
  /** Simple daily returns (0.01 = +1%). */
  r: readonly number[];
}

/** Daily simple returns of a ticker, optionally from a date on (the first return ends after it). */
export function dailyReturns(ticker: Ticker, from?: string): Returns {
  const { dates, adj } = SERIES[ticker];
  const out: number[] = [];
  const ds: string[] = [];
  for (let i = 1; i < adj.length; i++) {
    if (from !== undefined && (dates[i - 1] as string) < from) continue;
    out.push((adj[i] as number) / (adj[i - 1] as number) - 1);
    ds.push(dates[i] as string);
  }
  return { dates: ds, r: out };
}

/** Daily returns of every ticker on the common calendar (from SOXL's inception). */
export const COMMON_RETURNS: Readonly<Record<Ticker, Returns>> = {
  TQQQ: dailyReturns('TQQQ', COMMON_START),
  QQQ: dailyReturns('QQQ', COMMON_START),
  SOXL: dailyReturns('SOXL', COMMON_START),
  SOXX: dailyReturns('SOXX', COMMON_START),
};

/** Value of `start` dollars invested on `from` (default: the common start), day by day. */
export function growthOf(ticker: Ticker, start = 10_000, from = COMMON_START): Series {
  const { dates, adj } = SERIES[ticker];
  const i0 = dates.findIndex((d) => d >= from);
  const base = adj[i0] as number;
  return {
    ticker,
    dates: dates.slice(i0),
    adj: adj.slice(i0).map((v) => (v / base) * start),
  };
}

/** Drawdown from the running peak at each day (≤ 0; −0.5 = 50% below the high). */
export function drawdown(values: readonly number[]): number[] {
  let peak = -Infinity;
  return values.map((v) => {
    peak = Math.max(peak, v);
    return v / peak - 1;
  });
}

/** Simple moving average; `null` until `n` values are in the window. */
export function sma(values: readonly number[], n: number): (number | null)[] {
  let sum = 0;
  return values.map((v, i) => {
    sum += v;
    if (i >= n) sum -= values[i - n] as number;
    return i >= n - 1 ? sum / n : null;
  });
}

/** Annualized rolling standard deviation of daily returns (252 trading days a year). */
export function rollingVol(r: readonly number[], n = 21): (number | null)[] {
  return r.map((_, i) => {
    if (i < n - 1) return null;
    const w = r.slice(i - n + 1, i + 1);
    return stdev(w) * Math.sqrt(252);
  });
}

export function mean(v: readonly number[]): number {
  return v.reduce((a, b) => a + b, 0) / v.length;
}

/** Sample standard deviation. */
export function stdev(v: readonly number[]): number {
  const m = mean(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
}

/** Pearson correlation. */
export function correlation(a: readonly number[], b: readonly number[]): number {
  const ma = mean(a);
  const mb = mean(b);
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < a.length; i++) {
    const da = (a[i] as number) - ma;
    const db = (b[i] as number) - mb;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  return sab / Math.sqrt(saa * sbb);
}

/** Least-squares slope and intercept of `y` on `x`. */
export function linreg(x: readonly number[], y: readonly number[]): { m: number; b: number } {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < x.length; i++) {
    const dx = (x[i] as number) - mx;
    sxy += dx * ((y[i] as number) - my);
    sxx += dx * dx;
  }
  const m = sxy / sxx;
  return { m, b: my - m * mx };
}

/** Compound annual growth rate between two values `days` calendar days apart. */
export function cagr(first: number, last: number, days: number): number {
  return (last / first) ** (365.25 / days) - 1;
}

const DAY_MS = 864e5;
/** Calendar days between two `YYYY-MM-DD` dates. */
export const daysBetween = (a: string, b: string): number =>
  (Date.parse(b) - Date.parse(a)) / DAY_MS;

/* ---------------------------------------------------------------------------------------------- */
/* Calendar returns                                                                               */
/* ---------------------------------------------------------------------------------------------- */

export interface PeriodReturn {
  year: number;
  /** 1–12 for months; 0 for whole years. */
  month: number;
  ret: number;
  /** The period is cut by the fund's inception or the end of the data. */
  partial: boolean;
}

/**
 * Returns per calendar month (`by: 'month'`) or year (`by: 'year'`): from the last close of the
 * previous period to the last close of this one. The first period runs from the first close on or
 * after `from` (default: the fund's first day), so it and the period still in progress are
 * `partial`.
 */
export function periodReturns(ticker: Ticker, by: 'month' | 'year', from?: string): PeriodReturn[] {
  const { dates, adj } = SERIES[ticker];
  const key = (d: string): string => (by === 'year' ? d.slice(0, 4) : d.slice(0, 7));
  const out: PeriodReturn[] = [];
  let base =
    from === undefined
      ? 0
      : Math.max(
          0,
          dates.findIndex((d) => d >= from),
        );
  const first = base;
  for (let i = base + 1; i < dates.length; i++) {
    const d = dates[i] as string;
    const next = dates[i + 1];
    if (next !== undefined && key(next) === key(d)) continue;
    out.push({
      year: Number(d.slice(0, 4)),
      month: by === 'year' ? 0 : Number(d.slice(5, 7)),
      ret: (adj[i] as number) / (adj[base] as number) - 1,
      partial: base === first || next === undefined,
    });
    base = i;
  }
  return out;
}

/* ---------------------------------------------------------------------------------------------- */
/* Per-year statistics                                                                            */
/* ---------------------------------------------------------------------------------------------- */

export interface YearStats {
  ticker: Ticker;
  year: number;
  /** Total return over the year (YTD for the current one). */
  ret: number;
  /** Annualized volatility of daily returns. */
  vol: number;
  /** Deepest peak-to-trough fall within the year. */
  maxDrawdown: number;
  /** Best and worst day. */
  best: number;
  worst: number;
  /** Share of days that closed up. */
  upShare: number;
  /** Trading days in the data for that year. */
  days: number;
  partial: boolean;
}

/** Per-calendar-year statistics, from the common start (full years from 2011). */
export function yearStats(ticker: Ticker): YearStats[] {
  const { dates, adj } = SERIES[ticker];
  const { r, dates: rd } = dailyReturns(ticker, COMMON_START);
  const years = [...new Set(rd.map((d) => Number(d.slice(0, 4))))];
  return years.map((year) => {
    const idx = rd.flatMap((d, i) => (Number(d.slice(0, 4)) === year ? [i] : []));
    const rs = idx.map((i) => r[i] as number);
    // Prices from the last close before the year to the last close in it.
    const lastIdx = dates.indexOf(rd[idx[idx.length - 1] as number] as string);
    const firstIdx = dates.indexOf(rd[idx[0] as number] as string) - 1;
    const prices = adj.slice(firstIdx, lastIdx + 1);
    return {
      ticker,
      year,
      ret: (adj[lastIdx] as number) / (adj[firstIdx] as number) - 1,
      vol: stdev(rs) * Math.sqrt(252),
      maxDrawdown: Math.min(...drawdown(prices)),
      best: Math.max(...rs),
      worst: Math.min(...rs),
      upShare: rs.filter((v) => v > 0).length / rs.length,
      days: rs.length,
      partial:
        (rd[idx[0] as number] as string) > `${year}-01-05` ||
        year === Number(LAST_DATE.slice(0, 4)),
    };
  });
}

/* ---------------------------------------------------------------------------------------------- */
/* Volatility decay                                                                               */
/* ---------------------------------------------------------------------------------------------- */

/**
 * Return of a daily-rebalanced `leverage`× fund over `years`, given its index's total return `R`
 * over the same period and the index's annualized volatility `sigma`, ignoring fees and financing.
 *
 * Under geometric Brownian motion the log of the fund is `L · ln(index) − (L² − L)·σ²·T / 2`, so
 * `fund = (1 + R)^L · exp(−(L² − L)·σ²·T / 2) − 1`: the fund beats `L×` the index's compound
 * return in calm trends and falls behind it in choppy markets ("volatility decay").
 */
export function leveragedReturn(R: number, sigma: number, leverage = 3, years = 1): number {
  const L = leverage;
  return (1 + R) ** L * Math.exp((-(L * L - L) * sigma * sigma * years) / 2) - 1;
}

/* ---------------------------------------------------------------------------------------------- */
/* Headline figures                                                                               */
/* ---------------------------------------------------------------------------------------------- */

export interface Headline {
  ticker: Ticker;
  last: number;
  /** Last day's change. */
  day: number;
  /** Year to date, from the last close of the previous year. */
  ytd: number;
  /** Return over the last 252 trading days. */
  oneYear: number;
  /** Compound annual growth rate since the common start. */
  cagr: number;
  /** Deepest drawdown since the common start. */
  maxDrawdown: number;
  /** Current drawdown from the all-time high. */
  fromHigh: number;
  /** 52-week (252-day) low and high of the total-return price. */
  low52: number;
  high52: number;
  /** Annualized volatility over the last 63 trading days. */
  vol3m: number;
}

export function headline(ticker: Ticker): Headline {
  const { dates, adj } = SERIES[ticker];
  const n = adj.length;
  const last = adj[n - 1] as number;
  const prevYearEnd = dates.findLastIndex((d) => d < LAST_DATE.slice(0, 4));
  const i0 = dates.findIndex((d) => d >= COMMON_START);
  const since = adj.slice(i0);
  const dd = drawdown(adj);
  const window = adj.slice(n - 252);
  const r = dailyReturns(ticker).r;
  return {
    ticker,
    last,
    day: last / (adj[n - 2] as number) - 1,
    ytd: last / (adj[prevYearEnd] as number) - 1,
    oneYear: last / (adj[n - 253] as number) - 1,
    cagr: cagr(adj[i0] as number, last, daysBetween(COMMON_START, LAST_DATE)),
    maxDrawdown: Math.min(...drawdown(since)),
    fromHigh: dd[n - 1] as number,
    low52: Math.min(...window),
    high52: Math.max(...window),
    vol3m: stdev(r.slice(-63)) * Math.sqrt(252),
  };
}

/* ---------------------------------------------------------------------------------------------- */
/* Formatting                                                                                     */
/* ---------------------------------------------------------------------------------------------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_NAMES: readonly string[] = MONTHS;

/** `0.1234` → `+12.3%` (`signed: false` drops the plus). */
export function pct(v: number, digits = 1, signed = true): string {
  const s = `${(v * 100).toFixed(digits)}%`;
  return signed && v > 0 ? `+${s}` : s.replace('-', '−');
}

/** `1234567` → `$1.23M`, `12345` → `$12.3K`, `12.3` → `$12.30`. */
export function usd(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(a >= 1e10 ? 1 : 2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e4) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** `2026-09-30` → `Sep 30, 2026`. */
export function fmtDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return `${MONTHS[m - 1]} ${day}, ${y}`;
}
