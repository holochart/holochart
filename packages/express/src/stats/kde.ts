/**
 * Density estimates for Express's figure factories (plan E10.8): a Gaussian kernel density
 * estimate with Scott's rule, as scipy's `gaussian_kde` computes it (which plotly.py's
 * `create_distplot` uses), and a fitted normal density (`scipy.stats.norm.fit` + `pdf`).
 */

const SQRT_2PI = Math.sqrt(2 * Math.PI);

function finite(samples: ArrayLike<unknown>): number[] {
  const out: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
  }
  return out;
}

function mean(values: readonly number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

/** A 1-D Gaussian KDE: its bandwidth and density function. */
export interface GaussianKde {
  /** Kernel standard deviation: the samples' standard deviation (n − 1) × Scott's factor n^(−1/5). */
  readonly bandwidth: number;
  /** Density at `x`. */
  pdf(x: number): number;
}

/**
 * A Gaussian kernel density estimate with Scott's rule, identical to scipy's
 * `gaussian_kde(samples)` in one dimension: the kernel variance is the samples' variance (with
 * n − 1) times `n^(−2/5)`, and the density at x is the mean of the kernels' densities.
 *
 * @throws {Error} With fewer than two finite samples or zero variance (scipy's singular matrix).
 */
export function gaussianKde(samples: ArrayLike<unknown>): GaussianKde {
  const data = finite(samples);
  const n = data.length;
  if (n < 2) throw new Error('gaussianKde: needs at least two finite samples.');
  const m = mean(data);
  let ss = 0;
  for (const v of data) ss += (v - m) ** 2;
  const variance = ss / (n - 1);
  if (!(variance > 0)) throw new Error('gaussianKde: the samples have zero variance.');
  const bandwidth = Math.sqrt(variance) * n ** (-1 / 5);
  const norm = 1 / (n * bandwidth * SQRT_2PI);
  return {
    bandwidth,
    pdf(x: number): number {
      let s = 0;
      for (const v of data) {
        const z = (x - v) / bandwidth;
        s += Math.exp(-0.5 * z * z);
      }
      return s * norm;
    },
  };
}

/** Maximum-likelihood normal fit (`scipy.stats.norm.fit`): mean and standard deviation with n. */
export function fitNormal(samples: ArrayLike<unknown>): { mean: number; sd: number } {
  const data = finite(samples);
  if (data.length === 0) throw new Error('fitNormal: needs at least one finite sample.');
  const m = mean(data);
  let ss = 0;
  for (const v of data) ss += (v - m) ** 2;
  return { mean: m, sd: Math.sqrt(ss / data.length) };
}

/** The normal density with `mean` and `sd` at `x`. */
export function normalPdf(x: number, mean: number, sd: number): number {
  const z = (x - mean) / sd;
  return Math.exp(-0.5 * z * z) / (sd * SQRT_2PI);
}
