/**
 * Descriptive statistics for `box` and `violin` (plan E10.4, E10.5), ported from plotly.js so the
 * numbers match Plotly's exactly: `Lib.interp` quantiles (Hazen, not R-7), `quartilemethod`,
 * fences at the last sample within 1.5 IQR, outlier bounds at 3 IQR, the 95% notch span, Gaussian
 * KDE with Silverman's-rule bandwidth and the `soft` / `hard` / `manual` span modes.
 *
 * Pure functions over (typed) arrays with no DOM or renderer dependency, so calc can run in a Web
 * Worker (ADR-011, E16.5). Sample arrays must be sorted ascending unless a function says otherwise.
 */

/** How quartiles are computed (Plotly's `quartilemethod`). */
export type QuartileMethod = 'linear' | 'exclusive' | 'inclusive';

/** Plotly's `roundingError` in `Lib.findBin`. */
const ROUNDING_ERROR = 1e-9;

/**
 * Plotly's `Lib.interp`: the value at fraction `p` of the sorted values in `[start, end)`, reading
 * each sample as the center of its `1/n` slice (the Hazen / R-5 definition: `p·n − 0.5`, clamped).
 */
export function interp(
  sorted: ArrayLike<number>,
  p: number,
  start = 0,
  end = sorted.length,
): number {
  const n = end - start;
  if (n <= 0) return NaN;
  const k = p * n - 0.5;
  if (k < 0) return sorted[start]!;
  if (k > n - 1) return sorted[end - 1]!;
  const frac = k % 1;
  return frac * sorted[start + Math.ceil(k)]! + (1 - frac) * sorted[start + Math.floor(k)]!;
}

/** First quartile, median and third quartile of sorted values. */
export interface Quartiles {
  readonly q1: number;
  readonly median: number;
  readonly q3: number;
}

/**
 * Quartiles of sorted values (Plotly's box calc). `linear` interpolates over the whole sample;
 * for an odd count, `exclusive` takes the medians of the halves without the median and `inclusive`
 * of the halves with it (even counts use `linear` in every method, as Plotly does).
 *
 * @example
 * ```ts
 * quartiles([1, 2, 3, 4, 5, 6, 7, 8, 9], 'linear'); // { q1: 2.75, median: 5, q3: 7.25 }
 * quartiles([1, 2, 3, 4, 5, 6, 7, 8, 9], 'exclusive'); // { q1: 2.5, median: 5, q3: 7.5 }
 * quartiles([1, 2, 3, 4, 5, 6, 7, 8, 9], 'inclusive'); // { q1: 3, median: 5, q3: 7 }
 * ```
 */
export function quartiles(
  sorted: ArrayLike<number>,
  method: QuartileMethod = 'linear',
  start = 0,
  end = sorted.length,
): Quartiles {
  const n = end - start;
  const median = interp(sorted, 0.5, start, end);
  if (n % 2 === 1 && method !== 'linear') {
    // `slice(0, n / 2)` / `slice(n / 2 + 1)` (exclusive), `slice(0, n / 2 + 1)` / `slice(n / 2)`.
    const half = Math.floor(n / 2);
    const [lowEnd, highStart] = method === 'exclusive' ? [half, half + 1] : [half + 1, half];
    return {
      q1: interp(sorted, 0.5, start, start + lowEnd),
      median,
      q3: interp(sorted, 0.5, start + highStart, end),
    };
  }
  return {
    q1: interp(sorted, 0.25, start, end),
    median,
    q3: interp(sorted, 0.75, start, end),
  };
}

/**
 * Plotly's `Lib.findBin` for an ascending array of edges: the index of the last edge `<= value`
 * (`< value` with `lineLow`), -1 when there is none. The value is nudged by `1e-9` of the mean
 * edge spacing like Plotly's, so values on an edge fall on the same side.
 */
export function findBin(
  value: number,
  edges: ArrayLike<number>,
  lineLow = false,
  start = 0,
  end = edges.length,
): number {
  const n = end - start;
  const size = n > 1 ? (edges[end - 1]! - edges[start]!) / (n - 1) : 1;
  const v = value + size * ROUNDING_ERROR * (lineLow ? -1 : 1) * (size >= 0 ? 1 : -1);
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const e = edges[start + mid]!;
    const before = size >= 0 ? (lineLow ? e < v : e <= v) : lineLow ? e >= v : e > v;
    if (before) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/** Lower whisker end: the smallest sample within 1.5 IQR below q1 (never above q1). */
export function lowerFence(
  sorted: ArrayLike<number>,
  q1: number,
  q3: number,
  start = 0,
  end = sorted.length,
): number {
  const n = end - start;
  if (n === 0) return q1;
  const i = Math.min(findBin(2.5 * q1 - 1.5 * q3, sorted, true, start, end) + 1, n - 1);
  return Math.min(q1, sorted[start + i]!);
}

/** Upper whisker end: the largest sample within 1.5 IQR above q3 (never below q3). */
export function upperFence(
  sorted: ArrayLike<number>,
  q1: number,
  q3: number,
  start = 0,
  end = sorted.length,
): number {
  const n = end - start;
  if (n === 0) return q3;
  const i = Math.max(findBin(2.5 * q3 - 1.5 * q1, sorted, false, start, end), 0);
  return Math.max(q3, sorted[start + i]!);
}

/**
 * Bounds 3 IQR beyond the quartiles (`4·q1 − 3·q3`, `4·q3 − 3·q1`): samples outside the fences but
 * inside these are Plotly's *suspected* outliers.
 */
export function outlierBounds(q1: number, q3: number): [number, number] {
  return [4 * q1 - 3 * q3, 4 * q3 - 3 * q1];
}

/** Half-height of the notch: the median's 95% confidence interval, `1.57·IQR/√n` (0 for n = 0). */
export function notchSpan(q1: number, q3: number, n: number): number {
  return n === 0 ? 0 : (1.57 * (q3 - q1)) / Math.sqrt(n);
}

/** Arithmetic mean of `values[start, end)` (NaN when empty). */
export function mean(values: ArrayLike<number>, start = 0, end = values.length): number {
  let sum = 0;
  for (let i = start; i < end; i++) sum += values[i]!;
  return sum / (end - start);
}

/**
 * Plotly's `Lib.variance`: the sum of squared deviations from `m` divided by `divisor` (the count
 * for the population variance, count − 1 for the sample variance).
 */
export function variance(
  values: ArrayLike<number>,
  m: number,
  divisor: number,
  start = 0,
  end = values.length,
): number {
  let sum = 0;
  for (let i = start; i < end; i++) {
    const d = values[i]! - m;
    sum += d * d;
  }
  return sum / divisor;
}

/** Everything a box shows, for one sample (all in the sample's units). */
export interface BoxStats {
  readonly n: number;
  readonly min: number;
  readonly max: number;
  readonly q1: number;
  readonly median: number;
  readonly q3: number;
  readonly mean: number;
  /** Population standard deviation (Plotly's box `sd`, before `sdmultiple`). */
  readonly sd: number;
  /** Whisker ends (fences). */
  readonly lowerFence: number;
  readonly upperFence: number;
  /** Suspected-outlier bounds (see {@link outlierBounds}). */
  readonly lowerOutlier: number;
  readonly upperOutlier: number;
  /** Notch half-height around the median. */
  readonly notchSpan: number;
}

/**
 * Box statistics of `sorted[start, end)` (non-empty, ascending), as Plotly's box calc computes
 * them from samples.
 */
export function boxStats(
  sorted: ArrayLike<number>,
  method: QuartileMethod = 'linear',
  start = 0,
  end = sorted.length,
): BoxStats {
  const n = end - start;
  const { q1, median, q3 } = quartiles(sorted, method, start, end);
  const m = mean(sorted, start, end);
  const [lowerOutlier, upperOutlier] = outlierBounds(q1, q3);
  return {
    n,
    min: sorted[start]!,
    max: sorted[end - 1]!,
    q1,
    median,
    q3,
    mean: m,
    sd: Math.sqrt(variance(sorted, m, n, start, end)),
    lowerFence: lowerFence(sorted, q1, q3, start, end),
    upperFence: upperFence(sorted, q1, q3, start, end),
    lowerOutlier,
    upperOutlier,
    notchSpan: notchSpan(q1, q3, n),
  };
}

// ---- Kernel density estimation (violin) ---------------------------------------------------------

/** Silverman's rule of thumb as Plotly writes it: `1.059 · min(sd, IQR / 1.349) · n^(−1/5)`. */
export function silvermanBandwidth(n: number, sampleSd: number, iqr: number): number {
  const a = Math.min(sampleSd, iqr / 1.349);
  return 1.059 * a * Math.pow(n, -0.2);
}

/**
 * The KDE bandwidth of one violin (Plotly's `calcBandwidth`): a user `bandwidth` is kept, but no
 * smaller than `span / 1e4`; the default is Silverman's rule with the sample standard deviation,
 * but no smaller than `span / 100`. All samples equal: the user bandwidth, else 0 (a flat violin).
 */
export function kdeBandwidth(
  sorted: ArrayLike<number>,
  stats: Pick<BoxStats, 'min' | 'max' | 'q1' | 'q3' | 'mean'>,
  bandwidth?: number,
  start = 0,
  end = sorted.length,
): number {
  const span = stats.max - stats.min;
  const user = bandwidth !== undefined && bandwidth > 0 ? bandwidth : undefined;
  if (!span) return user ?? 0;
  if (user !== undefined) return Math.max(user, span / 1e4);
  const n = end - start;
  const ssd = Math.sqrt(variance(sorted, stats.mean, n - 1, start, end));
  return Math.max(silvermanBandwidth(n, ssd, stats.q3 - stats.q1), span / 100);
}

/** How far a violin reaches along the value axis (Plotly's `spanmode`). */
export type SpanMode = 'soft' | 'hard' | 'manual';

/**
 * The value range a violin's KDE is drawn over: `soft` extends two bandwidths past the extreme
 * samples, `hard` stops at them, `manual` uses `span` (either end missing or invalid falls back to
 * the `soft` end, like Plotly).
 */
export function kdeSpan(
  mode: SpanMode,
  min: number,
  max: number,
  bandwidth: number,
  manual?: readonly [number, number],
): [number, number] {
  const loose: [number, number] = [min - 2 * bandwidth, max + 2 * bandwidth];
  if (mode === 'hard') return [min, max];
  if (mode === 'manual') {
    const a = manual?.[0];
    const b = manual?.[1];
    return [
      a !== undefined && Number.isFinite(a) ? a : loose[0],
      b !== undefined && Number.isFinite(b) ? b : loose[1],
    ];
  }
  return loose;
}

const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);

/**
 * Gaussian kernel density of `values[start, end)` (any order) at `x`, with bandwidth `h` > 0
 * (Plotly's `makeKDE`): `1/(n·h) · Σ φ((x − vᵢ)/h)`. Integrates to 1 over the real line.
 */
export function kdeAt(
  values: ArrayLike<number>,
  h: number,
  x: number,
  start = 0,
  end = values.length,
): number {
  let sum = 0;
  for (let i = start; i < end; i++) {
    const u = (x - values[i]!) / h;
    sum += Math.exp(-0.5 * u * u);
  }
  return (sum * INV_SQRT_2PI) / ((end - start) * h);
}

/** A KDE evaluated on a grid (see {@link kdeGrid}). */
export interface KdeGrid {
  /** Grid positions (value axis), from `span[0]` to `span[1]`. */
  readonly t: Float64Array;
  /** Density at each position. */
  readonly v: Float64Array;
  /** Largest density. */
  readonly max: number;
}

/**
 * The KDE of `values[start, end)` on the grid Plotly draws violins with: steps of at most a third
 * of the bandwidth that divide the span evenly, both ends included. With bandwidth 0 (all samples
 * equal) the result is one point of density 1 at `span[0]`. Returns `undefined` when the span or
 * bandwidth is not usable (Plotly logs an error and draws nothing).
 */
export function kdeGrid(
  values: ArrayLike<number>,
  bandwidth: number,
  span: readonly [number, number],
  start = 0,
  end = values.length,
): KdeGrid | undefined {
  if (bandwidth === 0) {
    return { t: Float64Array.of(span[0]), v: Float64Array.of(1), max: 1 };
  }
  const dist = span[1] - span[0];
  const n = Math.ceil(dist / (bandwidth / 3));
  const step = dist / n;
  if (!Number.isFinite(step) || !Number.isFinite(n) || n <= 0) return undefined;
  // Plotly's loop `for (t = span[0]; t < span[1] + step / 2; t += step)` gives n + 1 samples.
  const count = n + 1;
  const t = new Float64Array(count);
  const v = new Float64Array(count);
  let max = 0;
  let x = span[0];
  for (let k = 0; k < count; k++, x += step) {
    t[k] = x;
    const d = kdeAt(values, bandwidth, x, start, end);
    v[k] = d;
    if (d > max) max = d;
  }
  return { t, v, max };
}

// ---- Positions ----------------------------------------------------------------------------------

/**
 * Plotly's `Lib.distinctVals`: the sorted distinct finite values (values closer than a
 * 1/10000-of-the-average-spacing rounding error merge) and the smallest difference between them
 * (the whole range, or 1, when there is only one value).
 */
export function distinctValues(values: ArrayLike<number>): { values: number[]; minDiff: number } {
  const sorted = Array.from(values)
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  const last = sorted.length - 1;
  let minDiff = sorted[last]! - sorted[0]! || 1;
  const errDiff = minDiff / (last || 1) / 10000;
  const out: number[] = [];
  let previous: number | undefined;
  for (const v of sorted) {
    if (previous === undefined || v - previous > errDiff) {
      if (previous !== undefined) minDiff = Math.min(minDiff, v - previous);
      out.push(v);
      previous = v;
    }
  }
  if (out.length === 0) minDiff = 1;
  return { values: out, minDiff };
}

// ---- Jitter -------------------------------------------------------------------------------------

/**
 * Plotly's repeatable pseudo-random generator (`Lib.seedPseudoRandom` / `Lib.pseudoRandom`), which
 * box and violin points use for jitter: a linear congruential generator that skips values too close
 * to the previous one, for better local uniformity. A new generator starts at Plotly's seed, as
 * Plotly reseeds it for every trace it draws.
 */
export function pseudoRandom(): () => number {
  let seed = 2000000000;
  const next = (): number => {
    const last = seed;
    seed = (69069 * seed + 1) % 4294967296;
    if (Math.abs(seed - last) < 429496729) return next();
    return seed / 4294967296;
  };
  return next;
}

/** Plotly's `JITTERCOUNT` and `JITTERSPREAD` (box `plotPoints`). */
const JITTER_COUNT = 5;
const JITTER_SPREAD = 0.01;

/**
 * Dynamic jitter of one box's shown points (Plotly's `plotPoints`): points in dense stretches of
 * the value axis spread wider than isolated ones, and the widest spreads `jitter` of the box
 * half-width each way. Returns the offset of each point in box half-widths (add `pointpos`); `rand`
 * is shared by every box of a trace, in box order, like Plotly's generator.
 *
 * @param values - The shown points' values, ascending.
 * @param outliersOnly - Only outliers are shown (`boxpoints` other than `'all'`): neighbors on the
 *   far side of the box don't count as close.
 */
export function jitterOffsets(
  values: ArrayLike<number>,
  stats: Pick<BoxStats, 'min' | 'max' | 'q1' | 'q3' | 'lowerFence' | 'upperFence'>,
  jitter: number,
  outliersOnly: boolean,
  rand: () => number,
): Float64Array {
  const n = values.length;
  const out = new Float64Array(n);
  if (!jitter || n === 0) return out;
  // Normally the IQR, but when it is 0 or too small, a tenth of max − min.
  const typicalSpread = Math.max((stats.max - stats.min) / 10, stats.q3 - stats.q1);
  const minSpread = typicalSpread * 1e-9;
  const spreadLimit = typicalSpread * JITTER_SPREAD;
  const factors = new Float64Array(n);
  let maxFactor = 0;
  if (typicalSpread === 0) {
    factors.fill(1);
    maxFactor = 1;
  } else {
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - JITTER_COUNT);
      const i1 = Math.min(n - 1, i + JITTER_COUNT);
      let pmin = values[i0]!;
      let pmax = values[i1]!;
      if (outliersOnly) {
        if (values[i]! < stats.lowerFence) pmax = Math.min(pmax, stats.lowerFence);
        else pmin = Math.max(pmin, stats.upperFence);
      }
      let f = Math.sqrt((spreadLimit * (i1 - i0)) / (pmax - pmin + minSpread)) || 0;
      f = Math.min(Math.max(Math.abs(f), 0), 1);
      factors[i] = f;
      maxFactor = Math.max(maxFactor, f);
    }
  }
  const scaled = (jitter * 2) / (maxFactor || 1);
  for (let i = 0; i < n; i++) out[i] = scaled * factors[i]! * (rand() - 0.5);
  return out;
}
