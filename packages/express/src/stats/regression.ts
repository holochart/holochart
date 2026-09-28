/**
 * Ordinary least squares of one regressor (plan E23.5), as statsmodels' `OLS(y, x).fit()` computes
 * it for plotly.py's `ols` trendline: with a constant (`add_constant`, the intercept first in
 * `params`) or through the origin, R² centered with a constant and uncentered without (statsmodels'
 * rule), standard errors, t statistics and two-sided p-values from Student's t distribution.
 */

/** The fit of `y = params[0] + params[1] · x` (or `y = params[0] · x` without a constant). */
export interface OlsFit {
  /** Coefficients: `[intercept, slope]` with a constant, `[slope]` without (statsmodels' `params`). */
  readonly params: readonly number[];
  /** Names of the coefficients: `['const', 'x1']` or `['x1']` (statsmodels' `exog_names`). */
  readonly paramNames: readonly string[];
  /** Standard errors of the coefficients (`bse`). */
  readonly bse: readonly number[];
  /** t statistics of the coefficients (`tvalues`). */
  readonly tvalues: readonly number[];
  /** Two-sided p-values of the t statistics (`pvalues`). */
  readonly pvalues: readonly number[];
  /** Coefficient of determination: centered with a constant, uncentered without (`rsquared`). */
  readonly rsquared: number;
  /** R² adjusted for the degrees of freedom (`rsquared_adj`). */
  readonly rsquaredAdj: number;
  /** Number of observations used (`nobs`). */
  readonly nobs: number;
  /** Residual degrees of freedom: n − number of coefficients (`df_resid`). */
  readonly dfResid: number;
  /** Sum of squared residuals (`ssr`). */
  readonly ssr: number;
  /** Fitted values, one per observation (`fittedvalues`). */
  readonly fitted: readonly number[];
}

/**
 * Fit `y` on `x` by least squares. Pairs with a non-finite value are dropped (statsmodels'
 * `missing='drop'`). Degenerate designs follow statsmodels' pseudo-inverse: a constant non-zero
 * `x` with `addConstant` is taken as the constant column itself (`add_constant`'s
 * `has_constant='skip'`: one coefficient, the mean of y over x), and an all-zero regressor gets a
 * zero slope.
 *
 * @example
 * ```ts
 * ols([1, 2, 3, 4], [2, 4, 5, 8]).params; // [0, 1.9] (intercept, slope)
 * ```
 */
export function ols(
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  options: { readonly addConstant?: boolean } = {},
): OlsFit {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const xi = x[i] as number;
    const yi = y[i] as number;
    if (Number.isFinite(xi) && Number.isFinite(yi)) {
      xs.push(xi);
      ys.push(yi);
    }
  }
  const n = xs.length;
  const meanY = mean(ys);
  const addConstant = options.addConstant ?? true;
  // statsmodels' add_constant skips a column that is already a non-zero constant.
  const constantX = n > 0 && xs.every((v) => v === xs[0]) && xs[0] !== 0;
  let params: number[];
  let fitted: number[];
  let names: string[];
  let hasConstant: boolean;
  if (addConstant && constantX) {
    const c = xs[0] as number;
    params = [meanY / c];
    fitted = xs.map(() => meanY);
    names = ['x1'];
    hasConstant = true;
  } else if (addConstant) {
    const meanX = mean(xs);
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < n; i++) {
      const dx = (xs[i] as number) - meanX;
      sxx += dx * dx;
      sxy += dx * ((ys[i] as number) - meanY);
    }
    const slope = sxx > 0 ? sxy / sxx : 0;
    const intercept = meanY - slope * meanX;
    params = [intercept, slope];
    fitted = xs.map((v) => intercept + slope * v);
    names = ['const', 'x1'];
    hasConstant = true;
  } else {
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < n; i++) {
      sxx += (xs[i] as number) ** 2;
      sxy += (xs[i] as number) * (ys[i] as number);
    }
    const slope = sxx > 0 ? sxy / sxx : 0;
    params = [slope];
    fitted = xs.map((v) => slope * v);
    names = ['x1'];
    hasConstant = false;
  }

  let ssr = 0;
  let tss = 0;
  for (let i = 0; i < n; i++) {
    ssr += ((ys[i] as number) - (fitted[i] as number)) ** 2;
    tss += hasConstant ? ((ys[i] as number) - meanY) ** 2 : (ys[i] as number) ** 2;
  }
  const k = params.length;
  const dfResid = n - k;
  const rsquared = 1 - ssr / tss;
  // statsmodels: 1 − (n − k_constant) / df_resid · (1 − R²).
  const rsquaredAdj = 1 - ((n - (hasConstant ? 1 : 0)) / dfResid) * (1 - rsquared);

  // Standard errors: σ² · (XᵀX)⁻¹ with σ² = SSR / df_resid.
  const scale = ssr / dfResid;
  let bse: number[];
  if (params.length === 2) {
    const meanX = mean(xs);
    let sxx = 0;
    for (const v of xs) sxx += (v - meanX) ** 2;
    let sumX2 = 0;
    for (const v of xs) sumX2 += v * v;
    bse = sxx > 0 ? [Math.sqrt((scale * sumX2) / (n * sxx)), Math.sqrt(scale / sxx)] : [NaN, NaN];
  } else {
    let sxx = 0;
    for (const v of xs) sxx += v * v;
    bse = [sxx > 0 ? Math.sqrt(scale / sxx) : NaN];
  }
  const tvalues = params.map((p, i) => p / (bse[i] as number));
  const pvalues = tvalues.map((t) => studentTTwoSided(t, dfResid));
  return {
    params,
    paramNames: names,
    bse,
    tvalues,
    pvalues,
    rsquared,
    rsquaredAdj,
    nobs: n,
    dfResid,
    ssr,
    fitted,
  };
}

function mean(values: readonly number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

/** Two-sided p-value of `t` under Student's t with `df` degrees of freedom: I_{df/(df+t²)}(df/2, 1/2). */
export function studentTTwoSided(t: number, df: number): number {
  if (!Number.isFinite(t)) return Number.isNaN(t) || !(df > 0) ? NaN : 0;
  if (!(df > 0)) return NaN;
  return regularizedBeta(df / (df + t * t), df / 2, 0.5);
}

/** ln Γ(x) for x > 0 (Lanczos, g = 7, n = 9: ~15 significant digits). */
function logGamma(x: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const z = x - 1;
  let a = c[0] as number;
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += (c[i] as number) / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** The regularized incomplete beta function I_x(a, b) (continued fraction, Numerical Recipes §6.4). */
export function regularizedBeta(x: number, a: number, b: number): number {
  if (!(x >= 0 && x <= 1)) return NaN;
  if (x === 0 || x === 1) return x;
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  // The continued fraction converges fast for x < (a + 1) / (a + b + 2); use symmetry otherwise.
  if (x < (a + 1) / (a + b + 2)) return (front * betaFraction(x, a, b)) / a;
  return 1 - (front * betaFraction(1 - x, b, a)) / b;
}

function betaFraction(x: number, a: number, b: number): number {
  const tiny = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return h;
}
