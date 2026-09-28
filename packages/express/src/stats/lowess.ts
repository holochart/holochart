/**
 * LOWESS smoothing (plan E23.5): Cleveland's locally weighted linear regression with tricube
 * weights and bisquare robustifying iterations, a line-by-line port of statsmodels'
 * `nonparametric.lowess` (`_smoothers_lowess.pyx`), which plotly.py's `lowess` trendline calls.
 */

/** Options of {@link lowess}: statsmodels' arguments. */
export interface LowessOptions {
  /** Share of the points in each local fit, 0–1. Default 2/3. */
  readonly frac?: number;
  /** Robustifying iterations after the first fit. Default 3. */
  readonly it?: number;
  /**
   * Points closer than `delta` to the last fitted one are interpolated linearly instead of fitted
   * (a speed-up for large data). Default 0 (fit every point).
   */
  readonly delta?: number;
}

/**
 * Smooth `y` against `x`: the fitted value at each point, in the order of the input. Pairs with a
 * non-finite value are dropped first (statsmodels' `missing='drop'`; their fitted values are
 * `NaN`). Each point's neighbourhood is the `⌊frac · n⌋` nearest points (at least 2); a weighted
 * least-squares line through them with tricube weights `(1 − (d / dmax)³)³` gives the fitted
 * value, and each of `it` further passes reweights the points by the bisquare of their residuals
 * over six times the median absolute residual.
 *
 * @throws {RangeError} If `frac` is outside 0–1.
 */
export function lowess(
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  options: LowessOptions = {},
): number[] {
  const frac = options.frac ?? 2 / 3;
  if (!(frac >= 0 && frac <= 1)) throw new RangeError('lowess: frac must be in the range [0, 1].');
  const iterations = Math.max(0, Math.floor(options.it ?? 3));
  const delta = options.delta ?? 0;

  const order: number[] = [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (Number.isFinite(x[i]) && Number.isFinite(y[i])) order.push(i);
  }
  // A stable sort by x (numpy's argsort is not stable, but tied x get the same fitted value).
  order.sort((a, b) => (x[a] as number) - (x[b] as number));
  const xs = Float64Array.from(order, (i) => x[i] as number);
  const ys = Float64Array.from(order, (i) => y[i] as number);
  const fit = lowessSorted(xs, ys, frac, iterations, delta);

  const out = Array.from({ length: x.length }, () => NaN);
  order.forEach((i, k) => (out[i] = fit[k] as number));
  return out;
}

/** statsmodels' `lowess` on sorted, finite data (`given_xvals = False`). */
function lowessSorted(
  x: Float64Array,
  y: Float64Array,
  frac: number,
  iterations: number,
  delta: number,
): Float64Array {
  const n = x.length;
  const yFit = new Float64Array(n);
  if (n === 0) return yFit;
  let span = Math.floor(frac * n + 1e-10);
  if (span < 2) span = 2;
  if (span > n) span = n;
  const weights = new Float64Array(n);
  let residWeights: Float64Array = new Float64Array(n).fill(1);

  for (let robiter = 0; robiter <= iterations; robiter++) {
    let i = 0;
    let lastFit = -1;
    let left = 0;
    let right = span;
    yFit.fill(0);
    for (;;) {
      const xval = x[i] as number;
      // update_neighborhood: slide the window while its far end is closer.
      while (right < n && xval > ((x[left] as number) + (x[right] as number)) / 2) {
        left++;
        right++;
      }
      const radius = Math.max(xval - (x[left] as number), (x[right - 1] as number) - xval);
      const ok = localWeights(x, weights, residWeights, xval, left, right, radius);
      yFit[i] = ok ? localFit(x, y, xval, weights, left, right) : (y[i] as number);
      if (lastFit < i - 1) {
        // interpolate_skipped_fits
        const denom = (x[i] as number) - (x[lastFit] as number);
        for (let j = lastFit + 1; j < i; j++) {
          const a = ((x[j] as number) - (x[lastFit] as number)) / denom;
          yFit[j] = a * (yFit[i] as number) + (1 - a) * (yFit[lastFit] as number);
        }
      }
      // update_indices: copy the fit to tied x, skip points within delta.
      lastFit = i;
      const cutpoint = (x[lastFit] as number) + delta;
      // `k` keeps Python's loop semantics: the last index visited (or `lastFit` if none).
      let k = lastFit;
      for (let j = lastFit + 1; j < n; j++) {
        k = j;
        if ((x[j] as number) > cutpoint) break;
        if (x[j] === x[lastFit]) {
          yFit[j] = yFit[lastFit] as number;
          lastFit = j;
        }
      }
      i = Math.max(k - 1, lastFit + 1);
      if (lastFit >= n - 1) break;
    }
    if (robiter < iterations) residWeights = residualWeights(y, yFit);
  }
  return yFit;
}

/**
 * calculate_weights: tricube weights of the window times the robustness weights, normalized to
 * sum 1. False when fewer than two weights are above 1e-12 (the point keeps its y).
 */
function localWeights(
  x: Float64Array,
  weights: Float64Array,
  residWeights: Float64Array,
  xval: number,
  left: number,
  right: number,
  radius: number,
): boolean {
  weights.fill(0);
  let sum = 0;
  let nonzero = 0;
  for (let j = left; j < right; j++) {
    const d = Math.abs((x[j] as number) - xval) / radius;
    const c = 1 - d * d * d;
    const w = c * c * c * (residWeights[j] as number);
    weights[j] = w;
    sum += w;
    if (w > 1e-12) nonzero++;
  }
  if (nonzero < 2) return false;
  for (let j = left; j < right; j++) weights[j] = (weights[j] as number) / sum;
  return true;
}

/** calculate_y_fit: the weighted least-squares line of the window, evaluated at `xval`. */
function localFit(
  x: Float64Array,
  y: Float64Array,
  xval: number,
  weights: Float64Array,
  left: number,
  right: number,
): number {
  let meanX = 0;
  for (let j = left; j < right; j++) meanX += (weights[j] as number) * (x[j] as number);
  let sqdev = 0;
  for (let j = left; j < right; j++)
    sqdev += (weights[j] as number) * ((x[j] as number) - meanX) ** 2;
  sqdev = Math.max(sqdev, 1e-12);
  let fit = 0;
  for (let j = left; j < right; j++) {
    const p = (weights[j] as number) * (1 + ((xval - meanX) * ((x[j] as number) - meanX)) / sqdev);
    fit += p * (y[j] as number);
  }
  return fit;
}

/** calculate_residual_weights: bisquare of |residual| / (6 · median |residual|), capped at 1. */
function residualWeights(y: Float64Array, yFit: Float64Array): Float64Array {
  const n = y.length;
  const resid = new Float64Array(n);
  for (let j = 0; j < n; j++) resid[j] = Math.abs((y[j] as number) - (yFit[j] as number));
  const median = medianOf(resid);
  const out = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    let r = median === 0 ? ((resid[j] as number) > 0 ? 1 : 0) : (resid[j] as number) / (6 * median);
    if (r > 1) r = 1;
    const t = 1 - r * r;
    out[j] = t * t;
  }
  return out;
}

function medianOf(values: Float64Array): number {
  const sorted = Float64Array.from(values).sort();
  const n = sorted.length;
  const mid = n >> 1;
  return n % 2
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}
