/**
 * Shared analysis for the OpenRouter demo (docs page `demos/openrouter`): the weekly totals from
 * `data/exporouter.json` and the fits the original mk7s/exporouter page computes from them.
 *
 * Pure and DOM-free, so the docs page can also import it during server-side rendering (stat tiles
 * and tables are static HTML). It is a `.mts` file on purpose: the example registry treats every
 * `.ts` file under `examples/` (outside the root `_lib/`) as an example, and this is not one.
 */
import exporouter from './data/exporouter.json';

export interface Week {
  /** Monday of the week, `YYYY-MM-DD`. */
  week: string;
  /** Tokens processed that week, in trillions. */
  tokensT: number;
  /** Top three models by tokens: `[model id, trillions]`. */
  top: [string, number][];
  /** The current, incomplete week. */
  partial?: boolean;
  /** OpenRouter's forecast for the whole of the partial week, in trillions. */
  forecastT?: number;
}

export const SOURCE_URL: string = exporouter.source;
/** Retrieval date of the data, `YYYY-MM-DD`. */
export const RETRIEVED: string = exporouter.retrieved;

/** Every week, the partial current week last. */
export const WEEKS: readonly Week[] = exporouter.weeks as Week[];
/** Complete weeks only: the fits use these. */
export const FULL: readonly Week[] = WEEKS.filter((d) => !d.partial);
/** The partial current week, if there is one. */
export const CURRENT: Week | undefined = WEEKS.find((d) => d.partial);
/** Number of complete weeks. */
export const N = FULL.length;
/** Weeks of projection drawn after the last complete week. */
export const PROJ = 4;

const xs = FULL.map((_, i) => i);
const ys = FULL.map((d) => d.tokensT);

/* ---------------------------------------------------------------------------------------------- */
/* Fits                                                                                           */
/* ---------------------------------------------------------------------------------------------- */

/** Ordinary least squares `y = m·x + b`. */
export function linreg(x: readonly number[], y: readonly number[]): { m: number; b: number } {
  const n = x.length;
  const mx = x.reduce((a, v) => a + v, 0) / n;
  const my = y.reduce((a, v) => a + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    const dx = (x[i] as number) - mx;
    sxy += dx * ((y[i] as number) - my);
    sxx += dx * dx;
  }
  const m = sxy / sxx;
  return { m, b: my - m * mx };
}

/** Least squares `y = c0 + c1·x + c2·x²` by Gaussian elimination of the normal equations. */
function quadfit(x: readonly number[], y: readonly number[]): [number, number, number] {
  const S = (k: number): number => x.reduce((s, v) => s + v ** k, 0);
  const T = (k: number): number => x.reduce((s, v, i) => s + v ** k * (y[i] as number), 0);
  const A = [
    [S(0), S(1), S(2)],
    [S(1), S(2), S(3)],
    [S(2), S(3), S(4)],
  ];
  const B = [T(0), T(1), T(2)];
  const a = (r: number, c: number): number => (A[r] as number[])[c] as number;
  for (let c = 0; c < 3; c++) {
    for (let r = c + 1; r < 3; r++) {
      const f = a(r, c) / a(c, c);
      for (let k = c; k < 3; k++) (A[r] as number[])[k] = a(r, k) - f * a(c, k);
      B[r] = (B[r] as number) - f * (B[c] as number);
    }
  }
  const s: [number, number, number] = [0, 0, 0];
  for (let r = 2; r >= 0; r--) {
    let v = B[r] as number;
    for (let k = r + 1; k < 3; k++) v -= a(r, k) * s[k as 0 | 1 | 2];
    s[r as 0 | 1 | 2] = v / a(r, r);
  }
  return s;
}

/** R² in raw token space. */
function r2(pred: readonly number[]): number {
  const my = ys.reduce((a, v) => a + v, 0) / N;
  let rss = 0;
  let tss = 0;
  ys.forEach((y, i) => {
    rss += (y - (pred[i] as number)) ** 2;
    tss += (y - my) ** 2;
  });
  return 1 - rss / tss;
}

/** Akaike information criterion for least squares with `k` parameters. */
function aic(pred: readonly number[], k: number): number {
  const rss = ys.reduce((s, y, i) => s + (y - (pred[i] as number)) ** 2, 0);
  return N * Math.log(rss / N) + 2 * k;
}

const ef = linreg(xs, ys.map(Math.log));
const lf = linreg(xs, ys);
const qc = quadfit(xs, ys);

/** Exponential fit (least squares on `ln(tokens)`), in trillions, by week index. */
export const expFn = (i: number): number => Math.exp(ef.b + ef.m * i);
/** Linear fit, in trillions, by week index. */
export const linFn = (i: number): number => lf.b + lf.m * i;
/** Quadratic fit, in trillions, by week index. */
export const quadFn = (i: number): number => qc[0] + qc[1] * i + qc[2] * i * i;

/** Average weekly growth rate implied by the exponential fit (0.07 = 7 %). */
export const WEEKLY = Math.exp(ef.m) - 1;
/** Doubling time in weeks. */
export const DOUBLING = Math.LN2 / ef.m;
export const R2 = { exp: r2(xs.map(expFn)), lin: r2(xs.map(linFn)), quad: r2(xs.map(quadFn)) };
export const AIC = {
  exp: aic(xs.map(expFn), 2),
  lin: aic(xs.map(linFn), 2),
  quad: aic(xs.map(quadFn), 3),
};
export const BEST_AIC = Math.min(AIC.exp, AIC.quad, AIC.lin);

const half = Math.floor(N / 2);
/** Weekly growth rate fitted over the first half of the complete weeks. */
export const G1 = Math.exp(linreg(xs.slice(0, half), ys.slice(0, half).map(Math.log)).m) - 1;
/** Weekly growth rate fitted over the second half. */
export const G2 = Math.exp(linreg(xs.slice(half), ys.slice(half).map(Math.log)).m) - 1;
/** Last complete week over the first. */
export const MULTIPLE = (ys[N - 1] as number) / (ys[0] as number);

/** Rolling 4-week compound weekly growth, for every complete week from the fifth on. */
export const ROLLING: readonly { i: number; week: string; g: number; from: number; to: number }[] =
  xs.slice(4).map((i) => {
    const from = ys[i - 4] as number;
    const to = ys[i] as number;
    return { i, week: (FULL[i] as Week).week, g: (to / from) ** (1 / 4) - 1, from, to };
  });

/* ---------------------------------------------------------------------------------------------- */
/* Formatting (the original page's conventions)                                                   */
/* ---------------------------------------------------------------------------------------------- */

/** Trillions with three significant-ish digits: `9.80T`, `27.0T`, `129T`. */
export const fmtT = (v: number): string =>
  (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + 'T';

/** Signed percentage with a true minus sign: `+7.2%`, `−22.3%`. */
export const pct = (v: number, digits = 1): string =>
  (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(digits) + '%';

const utc = (s: string): Date => new Date(`${s}T00:00:00Z`);

/** `Feb 2`, or with other `Intl` options. */
export const fmtDate = (
  s: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
): string => utc(s).toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });

/** The date `k` weeks after `s`, `YYYY-MM-DD`. */
export const addWeeks = (s: string, k: number): string =>
  new Date(utc(s).getTime() + k * 7 * 864e5).toISOString().slice(0, 10);

/** First and last complete week, and the partial week if any. */
export const FIRST_WEEK = (FULL[0] as Week).week;
export const LAST_FULL_WEEK = (FULL[N - 1] as Week).week;
