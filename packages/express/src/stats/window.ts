/**
 * Moving-window statistics (plan E23.5) with pandas' semantics, for plotly.py's `rolling`,
 * `expanding` and `ewm` trendlines (`series.rolling(**options).mean()`, …): missing values stay in
 * the series and take up window positions, but are skipped by the statistics, and a result needs
 * `minPeriods` present values in its window (else `NaN`).
 */

/** A statistic of a window's present values, by pandas' method name, or a function of them. */
export type WindowFunction =
  | 'mean'
  | 'sum'
  | 'median'
  | 'min'
  | 'max'
  | 'std'
  | 'var'
  | 'count'
  | ((values: number[]) => number);

/** Options of {@link rolling}: pandas' `Series.rolling` arguments. */
export interface RollingOptions {
  /**
   * Window size: a number of observations, or a time span (`'7D'`, `'12h'`, `'30min'`, `'10s'`,
   * `'500ms'`) over the index values `times` (ms), counting back from each point (pandas'
   * offset windows, closed on the right).
   */
  readonly window: number | string;
  /**
   * Present values a window needs. Default: the window size for a number of observations, 1 for
   * a time span.
   */
  readonly minPeriods?: number;
  /** Center each window on its point instead of ending it there (pandas' `center`). */
  readonly center?: boolean;
  /**
   * Weights across a window of observations (pandas' `win_type`, a scipy window): `'boxcar'`
   * (equal), `'triang'`, or `'gaussian'` with `std` (in `functionArgs`). Weighted windows take
   * `'mean'`, `'sum'`, `'var'` and `'std'`.
   */
  readonly winType?: 'boxcar' | 'triang' | 'gaussian';
}

/** Options of {@link ewm}: pandas' `Series.ewm` arguments (exactly one of com, span, halflife, alpha). */
export interface EwmOptions {
  /** Center of mass: α = 1 / (1 + com), com ≥ 0. */
  readonly com?: number;
  /** Span: α = 2 / (span + 1), span ≥ 1. */
  readonly span?: number;
  /** Half-life in observations: α = 1 − exp(ln 0.5 / halflife), halflife > 0. */
  readonly halflife?: number;
  /** Smoothing factor, 0 < α ≤ 1. */
  readonly alpha?: number;
  /** Present values needed for a result. Default 0 (taken as 1, as pandas). */
  readonly minPeriods?: number;
  /** Divide by the decaying weights' sum (`adjust`, default true), or recurse `(1 − α) · prev + α · x`. */
  readonly adjust?: boolean;
  /** Let missing values not decay the weights of earlier ones. Default false. */
  readonly ignoreNa?: boolean;
}

/** The statistics {@link ewm} computes (pandas' `ExponentialMovingWindow` methods). */
export type EwmFunction = 'mean' | 'sum' | 'std' | 'var';

const MS: Record<string, number> = {
  D: 86_400_000,
  h: 3_600_000,
  H: 3_600_000,
  min: 60_000,
  T: 60_000,
  s: 1000,
  S: 1000,
  ms: 1,
  L: 1,
};

/** A pandas fixed-frequency offset (`'7D'`, `'1.5h'`, `'min'`) in ms. */
export function offsetMs(text: string): number {
  const match = /^\s*(\d+(?:\.\d+)?)?\s*(D|h|H|min|T|s|S|ms|L)\s*$/.exec(text);
  const unit = match?.[2];
  if (!match || unit === undefined) {
    throw new Error(
      `rolling: window '${text}' is not a number of observations or a fixed time span ('7D', '12h', '30min', '10s', '500ms').`,
    );
  }
  return Number(match[1] ?? 1) * (MS[unit] as number);
}

function present(values: ArrayLike<number>, start: number, end: number): number[] {
  const out: number[] = [];
  for (let j = start; j < end; j++) {
    const v = values[j] as number;
    if (!Number.isNaN(v)) out.push(v);
  }
  return out;
}

/**
 * pandas' statistic of a window's present values; `var` and `std` divide by n − `ddof` (default 1)
 * and are `NaN` for n ≤ `ddof`.
 */
export function windowStatistic(fn: WindowFunction, values: number[], ddof = 1): number {
  if (typeof fn === 'function') return fn(values);
  const n = values.length;
  switch (fn) {
    case 'count':
      return n;
    case 'sum': {
      let s = 0;
      for (const v of values) s += v;
      return s;
    }
    case 'mean': {
      if (n === 0) return NaN;
      let s = 0;
      for (const v of values) s += v;
      return s / n;
    }
    case 'min':
      return n === 0 ? NaN : Math.min(...values);
    case 'max':
      return n === 0 ? NaN : Math.max(...values);
    case 'median': {
      if (n === 0) return NaN;
      const sorted = [...values].sort((a, b) => a - b);
      const mid = n >> 1;
      return n % 2
        ? (sorted[mid] as number)
        : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
    }
    case 'var':
    case 'std': {
      if (n <= ddof) return NaN;
      let m = 0;
      for (const v of values) m += v;
      m /= n;
      let ss = 0;
      for (const v of values) ss += (v - m) ** 2;
      const variance = ss / (n - ddof);
      return fn === 'var' ? variance : Math.sqrt(variance);
    }
    default:
      throw new Error(`Unknown window function '${String(fn)}'.`);
  }
}

/** scipy's symmetric window of `m` points: `boxcar`, `triang` or `gaussian(m, std)`. */
function windowWeights(type: 'boxcar' | 'triang' | 'gaussian', m: number, std?: number): number[] {
  return Array.from({ length: m }, (_, k) => {
    if (type === 'boxcar') return 1;
    if (type === 'gaussian') {
      if (!(typeof std === 'number' && std > 0)) {
        throw new Error("rolling: winType 'gaussian' needs functionArgs { std } > 0.");
      }
      const t = (k - (m - 1) / 2) / std;
      return Math.exp(-0.5 * t * t);
    }
    // scipy.signal.windows.triang (sym): rising to the middle, mirrored.
    const i = Math.min(k, m - 1 - k) + 1;
    return m % 2 ? (2 * i) / (m + 1) : (2 * i - 1) / m;
  });
}

/**
 * A rolling statistic (pandas' `series.rolling(window, min_periods, center, win_type).fn()`):
 * for each point, `fn` of the present values in its window. `times` (ms) are the index for a
 * time-span window and must be sorted.
 *
 * @example
 * ```ts
 * rolling([1, 2, NaN, 4, 5], { window: 2 }, 'mean'); // [NaN, 1.5, NaN, NaN, 4.5]
 * ```
 */
export function rolling(
  values: ArrayLike<number>,
  options: RollingOptions,
  fn: WindowFunction = 'mean',
  functionArgs: Readonly<Record<string, unknown>> = {},
  times?: ArrayLike<number>,
): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(NaN);
  const { window } = options;
  const ddof = typeof functionArgs['ddof'] === 'number' ? functionArgs['ddof'] : 1;
  if (typeof window === 'string') {
    if (!times) throw new Error('rolling: a time-span window needs dates on the x axis.');
    if (options.center)
      throw new Error('rolling: center is not supported with a time-span window.');
    if (options.winType) throw new Error('rolling: winType needs a number of observations.');
    const span = offsetMs(window);
    const minPeriods = options.minPeriods ?? 1;
    let start = 0;
    for (let i = 0; i < n; i++) {
      // pandas' closed='right': (t − span, t].
      while (start < i && (times[start] as number) <= (times[i] as number) - span) start++;
      const vals = present(values, start, i + 1);
      out[i] = vals.length >= minPeriods ? windowStatistic(fn, vals, ddof) : NaN;
    }
    return out;
  }
  if (!(Number.isInteger(window) && window >= 0)) {
    throw new Error('rolling: window must be an integer 0 or greater, or a time span.');
  }
  const minPeriods = options.minPeriods ?? window;
  if (minPeriods > window) {
    throw new Error(`rolling: minPeriods ${minPeriods} must be <= window ${window}.`);
  }
  // pandas' FixedWindowIndexer: [i − window + 1, i + 1), shifted by (window − 1) / 2 centered.
  const offset = options.center ? Math.floor((window - 1) / 2) : 0;
  const weights =
    options.winType === undefined
      ? undefined
      : windowWeights(options.winType, window, functionArgs['std'] as number | undefined);
  if (weights && typeof fn !== 'string') {
    throw new Error('rolling: a weighted window takes mean, sum, var or std.');
  }
  for (let i = 0; i < n; i++) {
    const end = Math.min(n, i + 1 + offset);
    const start = Math.max(0, i + 1 + offset - window);
    if (weights) {
      // pandas takes `min_periods or len(window)` here: 0 means the window size.
      const minp = options.minPeriods || window;
      out[i] = weightedStatistic(values, weights, i + 1 + offset - window, end, minp, fn, ddof);
      continue;
    }
    const vals = present(values, start, end);
    out[i] = vals.length >= minPeriods && window > 0 ? windowStatistic(fn, vals, ddof) : NaN;
  }
  return out;
}

/**
 * pandas' `Window` aggregations (`roll_weighted_sum` / `_mean` / `_var`): the window's weights
 * line up with its positions (a window cut short at the start keeps the weights of its last
 * positions), and missing values drop out with their weights.
 */
function weightedStatistic(
  values: ArrayLike<number>,
  weights: readonly number[],
  first: number,
  end: number,
  minPeriods: number,
  fn: WindowFunction,
  ddof: number,
): number {
  let sw = 0;
  let swx = 0;
  let count = 0;
  const items: [number, number][] = [];
  for (let j = Math.max(0, first); j < end; j++) {
    const v = values[j] as number;
    if (Number.isNaN(v)) continue;
    const w = weights[j - first] as number;
    sw += w;
    swx += w * v;
    count++;
    items.push([w, v]);
  }
  if (count < Math.max(minPeriods, 1)) return NaN;
  switch (fn) {
    case 'sum':
      return swx;
    case 'mean':
      return swx / sw;
    case 'var':
    case 'std': {
      // West's weighted variance times n / (n − ddof), as pandas' roll_weighted_var.
      if (count <= ddof) return NaN;
      const m = swx / sw;
      let ss = 0;
      for (const [w, v] of items) ss += w * (v - m) ** 2;
      const variance = (ss / sw) * (count / (count - ddof));
      return fn === 'var' ? variance : Math.sqrt(variance);
    }
    default:
      throw new Error(
        `rolling: a weighted window takes mean, sum, var or std (got '${String(fn)}').`,
      );
  }
}

/**
 * An expanding statistic (pandas' `series.expanding(min_periods).fn()`): `fn` of the present
 * values up to each point. `minPeriods` defaults to 1.
 */
export function expanding(
  values: ArrayLike<number>,
  options: { readonly minPeriods?: number } = {},
  fn: WindowFunction = 'mean',
  functionArgs: Readonly<Record<string, unknown>> = {},
): number[] {
  const ddof = typeof functionArgs['ddof'] === 'number' ? functionArgs['ddof'] : 1;
  const minPeriods = options.minPeriods ?? 1;
  const n = values.length;
  const out = new Array<number>(n).fill(NaN);
  const vals: number[] = [];
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = values[i] as number;
    if (!Number.isNaN(v)) {
      vals.push(v);
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (vals.length < minPeriods) continue;
    const c = vals.length;
    switch (fn) {
      case 'count':
        out[i] = c;
        break;
      case 'sum':
        out[i] = sum;
        break;
      case 'mean':
        out[i] = c ? sum / c : NaN;
        break;
      case 'min':
        out[i] = c ? min : NaN;
        break;
      case 'max':
        out[i] = c ? max : NaN;
        break;
      default:
        out[i] = windowStatistic(fn, vals, ddof);
    }
  }
  return out;
}

/** pandas' `get_center_of_mass`: com from exactly one of com, span, halflife, alpha. */
export function centerOfMass(options: EwmOptions): number {
  const { com, span, halflife, alpha } = options;
  const given = [com, span, halflife, alpha].filter((v) => v !== undefined).length;
  if (given > 1) throw new Error('ewm: com, span, halflife and alpha are mutually exclusive.');
  if (com !== undefined) {
    if (!(com >= 0)) throw new Error('ewm: com must satisfy com >= 0.');
    return com;
  }
  if (span !== undefined) {
    if (!(span >= 1)) throw new Error('ewm: span must satisfy span >= 1.');
    return (span - 1) / 2;
  }
  if (halflife !== undefined) {
    if (!(halflife > 0)) throw new Error('ewm: halflife must satisfy halflife > 0.');
    const decay = 1 - Math.exp(Math.log(0.5) / halflife);
    return 1 / decay - 1;
  }
  if (alpha !== undefined) {
    if (!(alpha > 0 && alpha <= 1)) throw new Error('ewm: alpha must satisfy 0 < alpha <= 1.');
    return (1 - alpha) / alpha;
  }
  throw new Error('ewm: pass one of com, span, halflife or alpha.');
}

/**
 * An exponentially weighted statistic (pandas' `series.ewm(…).mean()` / `.sum()` / `.var()` /
 * `.std()`, a port of pandas' `ewm` and `ewmcov` loops). With `adjust` (default) the mean at t is
 * Σ (1 − α)^i x_{t−i} / Σ (1 − α)^i over present values; missing values keep the previous result
 * and, unless `ignoreNa`, still age the weights. `var` and `std` are bias-corrected.
 *
 * @example
 * ```ts
 * ewm([1, 2, 3, 4], { alpha: 0.2 }); // [1, 1.555556, 2.147541, 2.775068]
 * ```
 */
export function ewm(
  values: ArrayLike<number>,
  options: EwmOptions,
  fn: EwmFunction = 'mean',
): number[] {
  const com = centerOfMass(options);
  const minp = Math.max(Math.floor(options.minPeriods ?? 0), 1);
  const adjust = options.adjust ?? true;
  const ignoreNa = options.ignoreNa ?? false;
  if (fn === 'var' || fn === 'std') {
    const variance = ewmVar(values, com, minp, adjust, ignoreNa);
    return fn === 'var' ? variance : variance.map((v) => (v >= 0 ? Math.sqrt(v) : NaN));
  }
  if (fn === 'sum' && !adjust) throw new Error('ewm: sum is not implemented with adjust=false.');
  if (fn !== 'mean' && fn !== 'sum') {
    throw new Error(`ewm: function must be 'mean', 'sum', 'var' or 'std' (got '${String(fn)}').`);
  }
  const normalize = fn === 'mean';
  const n = values.length;
  const out = new Array<number>(n).fill(NaN);
  if (n === 0) return out;
  const alpha = 1 / (1 + com);
  const oldWtFactor = 1 - alpha;
  let newWt = adjust ? 1 : alpha;
  let weighted = values[0] as number;
  let nobs = Number.isNaN(weighted) ? 0 : 1;
  out[0] = nobs >= minp ? weighted : NaN;
  let oldWt = 1;
  for (let i = 1; i < n; i++) {
    const cur = values[i] as number;
    const observed = !Number.isNaN(cur);
    if (observed) nobs++;
    if (!Number.isNaN(weighted)) {
      if (observed || !ignoreNa) {
        if (normalize) oldWt *= oldWtFactor;
        else weighted = oldWtFactor * weighted;
        if (observed) {
          if (normalize) {
            // pandas skips the update when equal, to avoid rounding on constant series.
            if (weighted !== cur) {
              if (!adjust && com === 1) newWt = 1 - oldWt;
              weighted = (oldWt * weighted + newWt * cur) / (oldWt + newWt);
            }
            if (adjust) oldWt += newWt;
            else oldWt = 1;
          } else weighted += cur;
        }
      }
    } else if (observed) weighted = cur;
    out[i] = nobs >= minp ? weighted : NaN;
  }
  return out;
}

/** pandas' `ewmcov(x, x, bias=False)`. */
function ewmVar(
  values: ArrayLike<number>,
  com: number,
  minp: number,
  adjust: boolean,
  ignoreNa: boolean,
): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(NaN);
  if (n === 0) return out;
  const alpha = 1 / (1 + com);
  const oldWtFactor = 1 - alpha;
  const newWt = adjust ? 1 : alpha;
  let mean = values[0] as number;
  let nobs = Number.isNaN(mean) ? 0 : 1;
  let cov = 0;
  let sumWt = 1;
  let sumWt2 = 1;
  let oldWt = 1;
  for (let i = 1; i < n; i++) {
    const cur = values[i] as number;
    const observed = !Number.isNaN(cur);
    if (observed) nobs++;
    if (!Number.isNaN(mean)) {
      if (observed || !ignoreNa) {
        sumWt *= oldWtFactor;
        sumWt2 *= oldWtFactor * oldWtFactor;
        oldWt *= oldWtFactor;
        if (observed) {
          const oldMean = mean;
          if (mean !== cur) mean = (oldWt * oldMean + newWt * cur) / (oldWt + newWt);
          cov =
            (oldWt * (cov + (oldMean - mean) * (oldMean - mean)) +
              newWt * ((cur - mean) * (cur - mean))) /
            (oldWt + newWt);
          sumWt += newWt;
          sumWt2 += newWt * newWt;
          oldWt += newWt;
          if (!adjust) {
            sumWt /= oldWt;
            sumWt2 /= oldWt * oldWt;
            oldWt = 1;
          }
        }
      }
    } else if (observed) mean = cur;
    if (nobs >= minp) {
      const numerator = sumWt * sumWt;
      const denominator = numerator - sumWt2;
      out[i] = denominator > 0 ? (numerator / denominator) * cov : NaN;
    }
  }
  return out;
}
