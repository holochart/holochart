/**
 * Shared data and analysis for the index funds demo (docs page `demos/index-funds`): four years of
 * daily total-return prices of the main US index ETFs, the sector, style and asset-class ETFs
 * around them, the S&P 500's and the Dow's holdings, and the statistics the charts draw from them.
 *
 * The four years run from the close of Sep 30, 2022 to the close of Sep 30, 2026 and split at the
 * close of Sep 30, 2024 into two halves of 501 sessions, 24 months and 8 quarters each. Every
 * statistic takes a `Period`: `'first'`, `'second'` or `'all'`.
 *
 * Pure and DOM-free, so the docs page can import it during server-side rendering. A `.mts` file
 * on purpose: the example registry treats every `.ts` file under `examples/` as an example.
 */
import holdingsJson from './data/holdings.json';
import market from './data/market.json';

/* ---------------------------------------------------------------------------------------------- */
/* Tickers                                                                                        */
/* ---------------------------------------------------------------------------------------------- */

/** The main index funds: the page's subject. */
export type Fund = 'SPY' | 'QQQ' | 'DIA' | 'IWM' | 'VTI';
export type Style = 'RSP' | 'MDY' | 'VUG' | 'VTV';
export type Sector =
  'XLK' | 'XLC' | 'XLY' | 'XLF' | 'XLV' | 'XLI' | 'XLP' | 'XLE' | 'XLU' | 'XLB' | 'XLRE';
export type Asset = 'VXUS' | 'VEA' | 'VWO' | 'BND' | 'TLT' | 'GLD' | 'BIL';
export type Stock = 'NVDA' | 'AAPL' | 'MSFT' | 'AMZN' | 'GOOGL' | 'META' | 'TSLA' | 'AVGO';
export type Ticker = Fund | Style | Sector | Asset | Stock;

/** The five main index funds, S&P 500 first. */
export const FUNDS = market.groups.funds as readonly Fund[];
/** The funds with daily bars in `OHLCV`. */
export type Traded = 'SPY' | 'QQQ' | 'DIA' | 'IWM';
/** The four with different indexes (VTI moves almost exactly with SPY): use where five crowd. */
export const CORE: readonly Traded[] = ['SPY', 'QQQ', 'DIA', 'IWM'];
/** Equal weight, mid caps, large growth, large value. */
export const STYLES = market.groups.styles as readonly Style[];
/** The eleven S&P 500 sector funds (Select Sector SPDRs). */
export const SECTORS = market.groups.sectors as readonly Sector[];
/** Other asset classes: international stocks, bonds, gold, cash. */
export const ASSETS = market.groups.assets as readonly Asset[];
/** Eight of the largest S&P 500 companies at the end of the four years (the "Magnificent Seven" and Broadcom). */
export const STOCKS = market.groups.stocks as readonly Stock[];
/** Every ETF (no single stocks). */
export const ETFS: readonly Ticker[] = [...FUNDS, ...STYLES, ...SECTORS, ...ASSETS];

/** What each ticker tracks, short enough for an axis tick or a legend. */
export const LABEL: Readonly<Record<Ticker, string>> = {
  SPY: 'S&P 500',
  QQQ: 'Nasdaq-100',
  DIA: 'Dow 30',
  IWM: 'Russell 2000',
  VTI: 'Total market',
  RSP: 'S&P 500 equal weight',
  MDY: 'Mid caps',
  VUG: 'Large growth',
  VTV: 'Large value',
  XLK: 'Technology',
  XLC: 'Communication',
  XLY: 'Consumer discretionary',
  XLF: 'Financials',
  XLV: 'Health care',
  XLI: 'Industrials',
  XLP: 'Consumer staples',
  XLE: 'Energy',
  XLU: 'Utilities',
  XLB: 'Materials',
  XLRE: 'Real estate',
  VXUS: 'International stocks',
  VEA: 'Developed markets',
  VWO: 'Emerging markets',
  BND: 'US bonds',
  TLT: 'Long Treasuries',
  GLD: 'Gold',
  BIL: 'T-bills (cash)',
  NVDA: 'NVIDIA',
  AAPL: 'Apple',
  MSFT: 'Microsoft',
  AMZN: 'Amazon',
  GOOGL: 'Alphabet',
  META: 'Meta',
  TSLA: 'Tesla',
  AVGO: 'Broadcom',
};
/** The fund's full name, as Yahoo Finance gives it. */
export const NAMES = market.names as Readonly<Record<Ticker, string>>;
/** `'SPY · S&P 500'`: ticker and what it tracks. */
export const tag = (t: Ticker): string => `${t} · ${LABEL[t]}`;

/** Which group a ticker belongs to. */
export type Group = 'fund' | 'style' | 'sector' | 'asset' | 'stock';
export function groupOf(t: Ticker): Group {
  if ((FUNDS as readonly string[]).includes(t)) return 'fund';
  if ((STYLES as readonly string[]).includes(t)) return 'style';
  if ((SECTORS as readonly string[]).includes(t)) return 'sector';
  if ((ASSETS as readonly string[]).includes(t)) return 'asset';
  return 'stock';
}

/* ---------------------------------------------------------------------------------------------- */
/* Colors                                                                                         */
/* ---------------------------------------------------------------------------------------------- */

/**
 * One hue per main fund, from the default template's colorway, checked on its dark background.
 * VTI is a neutral gray and dashed (`DASH`) because it shadows SPY.
 */
export const COLOR: Readonly<Record<Fund, string>> = {
  SPY: '#5e74d5',
  QQQ: '#cc540a',
  DIA: '#128b8b',
  IWM: '#b8267e',
  VTI: '#9a9db0',
};
export const DASH: Readonly<Record<Fund, string>> = {
  SPY: 'solid',
  QQQ: 'solid',
  DIA: 'solid',
  IWM: 'solid',
  VTI: 'dot',
};
/** One color per sector fund, for categorical sector charts (treemap, sunburst, lines). */
export const SECTOR_COLOR: Readonly<Record<Sector, string>> = {
  XLK: '#5e74d5',
  XLC: '#9962c0',
  XLY: '#cc540a',
  XLF: '#128b8b',
  XLV: '#ea2a37',
  XLI: '#997600',
  XLP: '#118e36',
  XLE: '#b8267e',
  XLU: '#4b9fd8',
  XLB: '#8a6d4b',
  XLRE: '#70758a',
};
/** One color per group, for charts that show every ETF. */
export const GROUP_COLOR: Readonly<Record<Group, string>> = {
  fund: '#5e74d5',
  style: '#9962c0',
  sector: '#128b8b',
  asset: '#997600',
  stock: '#cc540a',
};
/** Any ticker's color: its own for funds and sectors, its group's otherwise. */
export function colorOf(t: Ticker): string {
  return (
    (COLOR as Record<string, string>)[t] ??
    (SECTOR_COLOR as Record<string, string>)[t] ??
    GROUP_COLOR[groupOf(t)]
  );
}
/** Rising and falling (the default template's emerald and red), and the diverging midpoint. */
export const UP = '#118e36';
export const DOWN = '#ea2a37';
export const NEUTRAL = '#4b475c';
/** Red → neutral → green, for signed returns (heatmaps, contours). Center it with `zmid: 0`. */
export const RETURN_SCALE: [number, string][] = [
  [0, DOWN],
  [0.5, NEUTRAL],
  [1, UP],
];

/* ---------------------------------------------------------------------------------------------- */
/* Calendar and periods                                                                           */
/* ---------------------------------------------------------------------------------------------- */

/** Retrieval date of the data, `YYYY-MM-DD`. */
export const RETRIEVED: string = market.retrieved;
/**
 * Every session in the data, `YYYY-MM-DD`. It starts a year before the four years (`BASE`), so
 * drawdowns see the 2021–22 highs and rolling windows are full on the first day.
 */
export const CALENDAR: readonly string[] = market.date;
/** Index in `CALENDAR` of the close the four years start from (Sep 30, 2022). */
export const BASE: number = market.base;
/** Index of the close that ends the first half and starts the second (Sep 30, 2024). */
export const SPLIT: number = market.split;
/** Index of the last close (Sep 30, 2026). */
export const END: number = CALENDAR.length - 1;
export const BASE_DATE = CALENDAR[BASE] as string;
export const SPLIT_DATE = CALENDAR[SPLIT] as string;
export const LAST_DATE = CALENDAR[END] as string;

export type Half = 'first' | 'second';
export type Period = Half | 'all';
export const HALVES: readonly Half[] = ['first', 'second'];

export interface PeriodInfo {
  key: Period;
  /** `'Oct 2022 – Sep 2024'`. */
  label: string;
  /** `'2022–24'`. */
  short: string;
  /** Index in `CALENDAR` of the close the period starts from, and of its last close. */
  from: number;
  to: number;
  /** The period's color wherever the two halves are compared (the same two colors everywhere). */
  color: string;
}
/** The two halves and the whole. The first half is teal, the second amber. */
export const PERIODS: Readonly<Record<Period, PeriodInfo>> = {
  first: {
    key: 'first',
    label: 'Oct 2022 – Sep 2024',
    short: '2022–24',
    from: BASE,
    to: SPLIT,
    color: '#2ba7a7',
  },
  second: {
    key: 'second',
    label: 'Oct 2024 – Sep 2026',
    short: '2024–26',
    from: SPLIT,
    to: END,
    color: '#e0a22b',
  },
  all: {
    key: 'all',
    label: 'Oct 2022 – Sep 2026',
    short: '2022–26',
    from: BASE,
    to: END,
    color: '#9a9db0',
  },
};
/** Which half a session (an index in `CALENDAR`, after `BASE`) belongs to. */
export const halfOf = (i: number): Half => (i <= SPLIT ? 'first' : 'second');

/** Trading days per year, for annualizing. */
export const YEAR = 252;

/* ---------------------------------------------------------------------------------------------- */
/* Prices and returns                                                                             */
/* ---------------------------------------------------------------------------------------------- */

const ADJ = market.adjClose as Readonly<Record<Ticker, readonly number[]>>;

/** A ticker's total-return price (split- and dividend-adjusted close) on every `CALENDAR` day. */
export const adj = (t: Ticker): readonly number[] => ADJ[t];

export interface Path {
  /** Sessions, `YYYY-MM-DD`; the first is the close the period starts from. */
  dates: readonly string[];
  value: number[];
}
/** What `start` dollars became, day by day, with dividends reinvested. */
export function growth(t: Ticker, period: Period = 'all', start = 10_000): Path {
  const { from, to } = PERIODS[period];
  const a = ADJ[t];
  const base = a[from] as number;
  return {
    dates: CALENDAR.slice(from, to + 1),
    value: a.slice(from, to + 1).map((v) => (v / base) * start),
  };
}

export interface Returns {
  /** Sessions, `YYYY-MM-DD`: one per return. */
  dates: readonly string[];
  /** Simple daily total returns (0.01 is +1%). */
  r: number[];
}
/** Daily returns of the period's sessions (501 per half). */
export function dailyReturns(t: Ticker, period: Period = 'all'): Returns {
  const { from, to } = PERIODS[period];
  const a = ADJ[t];
  const r: number[] = [];
  for (let i = from + 1; i <= to; i++) r.push((a[i] as number) / (a[i - 1] as number) - 1);
  return { dates: CALENDAR.slice(from + 1, to + 1), r };
}

/** Total return between two closes (indexes in `CALENDAR`). */
export const returnBetween = (t: Ticker, from: number, to: number): number =>
  (ADJ[t][to] as number) / (ADJ[t][from] as number) - 1;
export const totalReturn = (t: Ticker, period: Period = 'all'): number =>
  returnBetween(t, PERIODS[period].from, PERIODS[period].to);
/** Years in a period (2 per half). */
export const yearsIn = (period: Period): number => (period === 'all' ? 4 : 2);
/** Annualized return. */
export const cagr = (t: Ticker, period: Period = 'all'): number =>
  (1 + totalReturn(t, period)) ** (1 / yearsIn(period)) - 1;

export const mean = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
/** Sample standard deviation. */
export function std(v: readonly number[]): number {
  const m = mean(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
}
/** Linear-interpolated quantile, `q` in 0…1. */
export function quantile(v: readonly number[], q: number): number {
  const s = [...v].sort((a, b) => a - b);
  const p = (s.length - 1) * q;
  const lo = Math.floor(p);
  return (
    (s[lo] as number) +
    ((s[Math.min(lo + 1, s.length - 1)] as number) - (s[lo] as number)) * (p - lo)
  );
}
/** Pearson correlation. */
export function corr(x: readonly number[], y: readonly number[]): number {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i++) {
    const dx = (x[i] as number) - mx;
    const dy = (y[i] as number) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxy / Math.sqrt(sxx * syy);
}
/** Least squares `y = m·x + b`. */
export function linreg(
  x: readonly number[],
  y: readonly number[],
): { m: number; b: number; r2: number } {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += ((x[i] as number) - mx) * ((y[i] as number) - my);
    sxx += ((x[i] as number) - mx) ** 2;
  }
  const m = sxy / sxx;
  return { m, b: my - m * mx, r2: corr(x, y) ** 2 };
}

/** Annualized volatility of daily returns. */
export const volatility = (t: Ticker, period: Period = 'all'): number =>
  std(dailyReturns(t, period).r) * Math.sqrt(YEAR);
/** Correlation of two tickers' daily returns. */
export const correlation = (a: Ticker, b: Ticker, period: Period = 'all'): number =>
  corr(dailyReturns(a, period).r, dailyReturns(b, period).r);
/** Correlation matrix, `matrix[row][column]`, in the order of `tickers`. */
export const corrMatrix = (tickers: readonly Ticker[], period: Period = 'all'): number[][] =>
  tickers.map((a) => tickers.map((b) => (a === b ? 1 : correlation(a, b, period))));
/** Slope of a ticker's daily return on another's (SPY by default). */
export const beta = (t: Ticker, period: Period = 'all', against: Ticker = 'SPY'): number =>
  linreg(dailyReturns(against, period).r, dailyReturns(t, period).r).m;

/* ---------------------------------------------------------------------------------------------- */
/* Drawdowns                                                                                      */
/* ---------------------------------------------------------------------------------------------- */

/**
 * How far below its previous high a ticker closed on each of the four years' sessions (0 at a
 * high, −0.2 when 20% below). The high is the all-time high as far as the data goes, including
 * the year before `BASE`, so the series starts deep in the 2022 bear market.
 */
export function drawdowns(t: Ticker): { dates: readonly string[]; dd: number[] } {
  const a = ADJ[t];
  let peak = 0;
  const dd: number[] = [];
  for (let i = 0; i <= END; i++) {
    peak = Math.max(peak, a[i] as number);
    if (i >= BASE) dd.push((a[i] as number) / peak - 1);
  }
  return { dates: CALENDAR.slice(BASE), dd };
}

/** Deepest fall from a high made inside the period (so a half is judged on its own highs). */
export function maxDrawdown(
  t: Ticker,
  period: Period = 'all',
): { depth: number; peak: string; trough: string } {
  const { from, to } = PERIODS[period];
  const a = ADJ[t];
  let peak = from;
  let best = { depth: 0, peak: CALENDAR[from] as string, trough: CALENDAR[from] as string };
  for (let i = from; i <= to; i++) {
    if ((a[i] as number) > (a[peak] as number)) peak = i;
    const depth = (a[i] as number) / (a[peak] as number) - 1;
    if (depth < best.depth)
      best = { depth, peak: CALENDAR[peak] as string, trough: CALENDAR[i] as string };
  }
  return best;
}

export interface Episode {
  /** The high before the fall, the low, and the first close back above the high (if any). */
  peak: string;
  trough: string;
  recovery: string | null;
  /** Depth at the low, negative. */
  depth: number;
  /** Sessions from high to low, and from low to recovery (to the last close if not recovered). */
  down: number;
  up: number;
}
/**
 * Every fall of at least `threshold` from an all-time high that was still under way during the
 * four years, oldest first. The first one starts before `BASE` (the 2022 bear market).
 */
export function episodes(t: Ticker, threshold = 0.05): Episode[] {
  const a = ADJ[t];
  const out: Episode[] = [];
  let peak = 0;
  let trough = 0;
  const close = (recovery: number | null): void => {
    const depth = (a[trough] as number) / (a[peak] as number) - 1;
    if (depth <= -threshold && (recovery ?? END) > BASE) {
      out.push({
        peak: CALENDAR[peak] as string,
        trough: CALENDAR[trough] as string,
        recovery: recovery === null ? null : (CALENDAR[recovery] as string),
        depth,
        down: trough - peak,
        up: (recovery ?? END) - trough,
      });
    }
  };
  for (let i = 1; i <= END; i++) {
    if ((a[i] as number) >= (a[peak] as number)) {
      if (trough > peak) close(i);
      peak = i;
      trough = i;
    } else if ((a[i] as number) < (a[trough] as number)) trough = i;
  }
  if (trough > peak) close(null);
  return out;
}

/* ---------------------------------------------------------------------------------------------- */
/* Calendar returns                                                                               */
/* ---------------------------------------------------------------------------------------------- */

export interface Span {
  /** `'2022-10'` for a month, `'2022-Q4'` for a quarter, `'2023'` for a year. */
  key: string;
  /** `'Oct 2022'`, `'Q4 2022'`, `'2023'`. */
  label: string;
  /** Indexes in `CALENDAR` of the close before the span and of its last close. */
  from: number;
  to: number;
  half: Half;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function spans(keyOf: (date: string) => string, labelOf: (key: string) => string): Span[] {
  const out: Span[] = [];
  let from = BASE;
  for (let i = BASE + 1; i <= END; i++) {
    const key = keyOf(CALENDAR[i] as string);
    if (i === END || keyOf(CALENDAR[i + 1] as string) !== key) {
      out.push({ key, label: labelOf(key), from, to: i, half: halfOf(i) });
      from = i;
    }
  }
  return out;
}
const quarterKey = (d: string): string =>
  `${d.slice(0, 4)}-Q${Math.ceil(Number(d.slice(5, 7)) / 3)}`;
/** The 48 months, Oct 2022 to Sep 2026. */
export const MONTH_SPANS: readonly Span[] = spans(
  (d) => d.slice(0, 7),
  (k) => `${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`,
);
/** The 16 quarters, Q4 2022 to Q3 2026. */
export const QUARTER_SPANS: readonly Span[] = spans(
  quarterKey,
  (k) => `${k.slice(5)} ${k.slice(0, 4)}`,
);
/** Calendar years: 2022 (Q4 only), 2023, 2024, 2025, 2026 (to September). */
export const YEAR_SPANS: readonly Span[] = spans(
  (d) => d.slice(0, 4),
  (k) => (k === '2022' ? '2022 (Q4)' : k === '2026' ? '2026 (to Sep)' : k),
);
/** A ticker's return over each span, in the spans' order. */
export const spanReturns = (t: Ticker, list: readonly Span[]): number[] =>
  list.map((s) => returnBetween(t, s.from, s.to));
export const monthlyReturns = (t: Ticker): number[] => spanReturns(t, MONTH_SPANS);
export const quarterlyReturns = (t: Ticker): number[] => spanReturns(t, QUARTER_SPANS);
export const yearlyReturns = (t: Ticker): number[] => spanReturns(t, YEAR_SPANS);

/* ---------------------------------------------------------------------------------------------- */
/* Rolling statistics                                                                             */
/* ---------------------------------------------------------------------------------------------- */

export interface Rolling {
  /** The four years' sessions (from the first session after `BASE`). */
  dates: readonly string[];
  value: number[];
}
function rolling(at: (i: number) => number): Rolling {
  const value: number[] = [];
  for (let i = BASE + 1; i <= END; i++) value.push(at(i));
  return { dates: CALENDAR.slice(BASE + 1), value };
}
function returnsBefore(t: Ticker, i: number, window: number): number[] {
  const a = ADJ[t];
  const r: number[] = [];
  for (let k = i - window + 1; k <= i; k++) r.push((a[k] as number) / (a[k - 1] as number) - 1);
  return r;
}
/** Annualized volatility of the trailing `window` sessions (63 is a quarter). */
export const rollingVol = (t: Ticker, window = 63): Rolling =>
  rolling((i) => std(returnsBefore(t, i, window)) * Math.sqrt(YEAR));
/** Correlation of two tickers' daily returns over the trailing `window` sessions. */
export const rollingCorr = (a: Ticker, b: Ticker, window = 63): Rolling =>
  rolling((i) => corr(returnsBefore(a, i, window), returnsBefore(b, i, window)));
/** Total return over the trailing `window` sessions (21 a month, 252 a year). */
export const rollingReturn = (t: Ticker, window = YEAR): Rolling =>
  rolling((i) => returnBetween(t, i - window, i));

/* ---------------------------------------------------------------------------------------------- */
/* One fund, one period: the scorecard                                                            */
/* ---------------------------------------------------------------------------------------------- */

export interface Stats {
  ticker: Ticker;
  period: Period;
  totalReturn: number;
  cagr: number;
  /** Annualized volatility. */
  vol: number;
  /** Annualized return over volatility (no risk-free rate subtracted). */
  ratio: number;
  /** Deepest fall from a high made inside the period, negative. */
  maxDrawdown: number;
  best: { date: string; r: number };
  worst: { date: string; r: number };
  /** Share of sessions that closed up. */
  upShare: number;
  /** Sessions that moved more than 1% and 2% either way. */
  over1: number;
  over2: number;
}
export function stats(t: Ticker, period: Period = 'all'): Stats {
  const { dates, r } = dailyReturns(t, period);
  let best = 0;
  let worst = 0;
  r.forEach((v, i) => {
    if (v > (r[best] as number)) best = i;
    if (v < (r[worst] as number)) worst = i;
  });
  const vol = std(r) * Math.sqrt(YEAR);
  const growthRate = cagr(t, period);
  return {
    ticker: t,
    period,
    totalReturn: totalReturn(t, period),
    cagr: growthRate,
    vol,
    ratio: growthRate / vol,
    maxDrawdown: maxDrawdown(t, period).depth,
    best: { date: dates[best] as string, r: r[best] as number },
    worst: { date: dates[worst] as string, r: r[worst] as number },
    upShare: r.filter((v) => v > 0).length / r.length,
    over1: r.filter((v) => Math.abs(v) > 0.01).length,
    over2: r.filter((v) => Math.abs(v) > 0.02).length,
  };
}

/* ---------------------------------------------------------------------------------------------- */
/* Prices as traded: OHLCV, yields, the VIX                                                       */
/* ---------------------------------------------------------------------------------------------- */

export interface Ohlcv {
  date: readonly string[];
  open: readonly number[];
  high: readonly number[];
  low: readonly number[];
  close: readonly number[];
  volume: readonly number[];
}
/** The four years' sessions, `BASE` included: the dates of `OHLCV` and `INDICATOR`. */
export const WINDOW: readonly string[] = CALENDAR.slice(BASE);
const bars = (t: Traded): Ohlcv => ({ date: WINDOW, ...market.ohlcv[t] });
/** Daily bars as traded (split-adjusted, not dividend-adjusted), `BASE` to `END`. */
export const OHLCV: Readonly<Record<Traded, Ohlcv>> = {
  SPY: bars('SPY'),
  QQQ: bars('QQQ'),
  DIA: bars('DIA'),
  IWM: bars('IWM'),
};

/**
 * Daily bars merged into one bar per week or month, dated at the group's first session. The base
 * session (Sep 30, 2022) is left out, so the first bar is the first week or month of the four years.
 */
export function resample(bars: Ohlcv, by: 'week' | 'month'): Ohlcv {
  const keyOf = (d: string): string => {
    if (by === 'month') return d.slice(0, 7);
    const day = new Date(`${d}T00:00:00Z`);
    // Monday of the date's week.
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
    return day.toISOString().slice(0, 10);
  };
  const out = {
    date: [] as string[],
    open: [] as number[],
    high: [] as number[],
    low: [] as number[],
    close: [] as number[],
    volume: [] as number[],
  };
  let last = '';
  bars.date.forEach((d, i) => {
    if (d <= BASE_DATE) return;
    const key = keyOf(d);
    const n = out.date.length - 1;
    if (key !== last) {
      last = key;
      out.date.push(d);
      out.open.push(bars.open[i] as number);
      out.high.push(bars.high[i] as number);
      out.low.push(bars.low[i] as number);
      out.close.push(bars.close[i] as number);
      out.volume.push(bars.volume[i] as number);
    } else {
      out.high[n] = Math.max(out.high[n] as number, bars.high[i] as number);
      out.low[n] = Math.min(out.low[n] as number, bars.low[i] as number);
      out.close[n] = bars.close[i] as number;
      out.volume[n] = (out.volume[n] as number) + (bars.volume[i] as number);
    }
  });
  return out;
}

/** Cash dividends per share paid during the four years, as `[ex-date, amount]`. */
export const DIVIDENDS = market.dividends as unknown as Readonly<
  Record<Traded, readonly [string, number][]>
>;

/**
 * Market gauges on the `WINDOW` sessions: the VIX (the S&P 500's expected volatility, in percent a
 * year), and the 10-year Treasury (`TNX`) and 13-week bill (`IRX`) yields in percent.
 */
export const INDICATOR: Readonly<Record<'VIX' | 'TNX' | 'IRX', readonly number[]>> = {
  VIX: market.indicators.VIX.slice(BASE),
  TNX: market.indicators.TNX.slice(BASE),
  IRX: market.indicators.IRX.slice(BASE),
};

/* ---------------------------------------------------------------------------------------------- */
/* Holdings                                                                                       */
/* ---------------------------------------------------------------------------------------------- */

export interface Holding {
  ticker: string;
  name: string;
  /** Percent of the fund's stock portfolio. */
  weight: number;
  /** The sector fund that holds the stock (S&P 500 only). */
  sector?: Sector;
}
/** What SPY (S&P 500, about 500 stocks) and DIA (the Dow's 30) hold, largest first. */
export const HOLDINGS = holdingsJson as unknown as Readonly<
  Record<'SPY' | 'DIA', { asOf: string; holdings: readonly Holding[] }>
>;
/** The S&P 500's weight in each sector, percent, largest first. */
export function sectorWeights(): { sector: Sector; weight: number; count: number }[] {
  return SECTORS.map((sector) => {
    const members = HOLDINGS.SPY.holdings.filter((h) => h.sector === sector);
    return { sector, weight: members.reduce((a, h) => a + h.weight, 0), count: members.length };
  }).sort((a, b) => b.weight - a.weight);
}
/** Percent of a fund in its `n` largest holdings. */
export const topShare = (fund: 'SPY' | 'DIA', n: number): number =>
  HOLDINGS[fund].holdings.slice(0, n).reduce((a, h) => a + h.weight, 0);

/* ---------------------------------------------------------------------------------------------- */
/* Events                                                                                         */
/* ---------------------------------------------------------------------------------------------- */

export interface MarketEvent {
  /** A session in `CALENDAR`. */
  date: string;
  /** A few words, for an annotation. */
  label: string;
  /** One sentence, for hover text. */
  note: string;
  half: Half;
}
/** The dated turning points of the four years that the charts annotate. */
export const EVENTS: readonly MarketEvent[] = [
  {
    date: '2022-10-12',
    label: 'Bear-market low',
    note: 'The S&P 500 closes 25% below its January 2022 high, the low of the 2022 bear market.',
    half: 'first',
  },
  {
    date: '2023-03-10',
    label: 'SVB fails',
    note: 'Silicon Valley Bank is closed by regulators; regional banks and small caps sell off.',
    half: 'first',
  },
  {
    date: '2023-10-27',
    label: '10-year near 5%',
    note: 'Stocks bottom after a three-month slide as the 10-year Treasury yield touches 5%.',
    half: 'first',
  },
  {
    date: '2024-08-05',
    label: 'Yen carry unwind',
    note: 'A global sell-off as yen-funded trades unwind; the VIX closes at 38.6.',
    half: 'first',
  },
  {
    date: '2024-11-06',
    label: 'Election rally',
    note: 'The day after the US election: the Russell 2000 gains almost 6%.',
    half: 'second',
  },
  {
    date: '2025-04-08',
    label: 'Tariff low',
    note: 'Four sessions after the April 2 tariff announcement the S&P 500 closes 19% below its February high; the VIX closes at 52.',
    half: 'second',
  },
  {
    date: '2025-04-09',
    label: 'Tariff pause',
    note: 'Most of the new tariffs are paused for 90 days: the S&P 500’s best day of the four years (+10.5%).',
    half: 'second',
  },
  {
    date: '2026-03-30',
    label: 'March 2026 low',
    note: 'The low of a two-month slide of about 9% in the S&P 500 and 12% in the Nasdaq-100; April 2026 then gains 10.5%.',
    half: 'second',
  },
];

/* ---------------------------------------------------------------------------------------------- */
/* Formatting                                                                                     */
/* ---------------------------------------------------------------------------------------------- */

/** `0.1234` → `'+12%'` (`digits` decimals; the sign is always shown, with a real minus). */
export function pct(v: number, digits = 0): string {
  const s = `${Math.abs(v * 100).toFixed(digits)}%`;
  return v < 0 ? `−${s}` : `+${s}`;
}
/** `0.1234` → `'12%'`, unsigned: for volatilities, weights and shares. */
export const share = (v: number, digits = 0): string => `${(v * 100).toFixed(digits)}%`;
/** `22490.4` → `'$22,490'`. */
export const usd = (v: number): string => `$${Math.round(v).toLocaleString('en-US')}`;
/** `'2025-04-09'` → `'Apr 9, 2025'`. */
export function fmtDate(d: string): string {
  return `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}, ${d.slice(0, 4)}`;
}
