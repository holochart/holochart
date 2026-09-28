/**
 * Trendline numerics (plan E23.5) against their references: OLS against hand-computed least
 * squares (statsmodels' definitions: centered R² with a constant, uncentered without); LOWESS
 * against R's `lowess` outputs from statsmodels' test suite; rolling / expanding / EWM against
 * pandas' documented examples and hand-computed windows (pandas' `adjust=True` weights).
 */
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { delta, frac, iter, simple } from './__fixtures__/lowess.ts';
import { lowess } from './lowess.ts';
import { ols, regularizedBeta, studentTTwoSided } from './regression.ts';
import { centerOfMass, ewm, expanding, offsetMs, rolling } from './window.ts';

/** Expect arrays equal to `digits` decimals, `NaN` matching `NaN`. */
function close(actual: readonly number[], expected: readonly number[], digits = 10): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((v, i) => {
    const e = expected[i] as number;
    if (Number.isNaN(e)) expect(v, `index ${i}`).toBeNaN();
    else expect(v, `index ${i}`).toBeCloseTo(e, digits);
  });
}

describe('ols (statsmodels OLS)', () => {
  it('fits an intercept and slope with centered R²', () => {
    // x̄ = 2.5, ȳ = 4.75, Sxx = 5, Sxy = 9.5: slope 1.9, intercept 0; SSR = 0.7, SST = 18.75.
    const fit = ols([1, 2, 3, 4], [2, 4, 5, 8]);
    close(fit.params, [0, 1.9]);
    expect(fit.paramNames).toEqual(['const', 'x1']);
    expect(fit.ssr).toBeCloseTo(0.7, 12);
    expect(fit.rsquared).toBeCloseTo(1 - 0.7 / 18.75, 12);
    expect(fit.rsquaredAdj).toBeCloseTo(1 - (3 / 2) * (0.7 / 18.75), 12);
    expect(fit.nobs).toBe(4);
    expect(fit.dfResid).toBe(2);
    close(fit.fitted, [1.9, 3.8, 5.7, 7.6]);
    // σ² = 0.35: se(slope) = √(σ²/Sxx), se(const) = √(σ² Σx² / (n Sxx)).
    close(fit.bse, [Math.sqrt((0.35 * 30) / 20), Math.sqrt(0.35 / 5)]);
    // Student's t with 2 df: p = 1 − |t| / √(t² + 2).
    const t = 1.9 / Math.sqrt(0.35 / 5);
    expect(fit.tvalues[1]).toBeCloseTo(t, 10);
    expect(fit.pvalues[1]).toBeCloseTo(1 - t / Math.sqrt(t * t + 2), 10);
    expect(fit.pvalues[0]).toBeCloseTo(1, 12);
  });

  it('fits through the origin with uncentered R² (add_constant=False)', () => {
    // slope = Σxy / Σx² = 57 / 30; R² = 1 − SSR / Σy².
    const fit = ols([1, 2, 3, 4], [2, 4, 5, 8], { addConstant: false });
    const slope = 57 / 30;
    close(fit.params, [slope]);
    expect(fit.paramNames).toEqual(['x1']);
    let ssr = 0;
    [2, 4, 5, 8].forEach((y, i) => (ssr += (y - slope * (i + 1)) ** 2));
    expect(fit.rsquared).toBeCloseTo(1 - ssr / 109, 12);
    expect(fit.dfResid).toBe(3);
  });

  it('drops non-finite pairs and follows statsmodels on degenerate designs', () => {
    expect(ols([1, NaN, 2, 3, 4], [2, 9, 4, 5, 8]).params).toEqual(
      ols([1, 2, 3, 4], [2, 4, 5, 8]).params,
    );
    // A constant non-zero x is taken as the constant column (add_constant's has_constant='skip').
    const constant = ols([2, 2, 2], [1, 2, 6]);
    close(constant.params, [1.5]);
    close(constant.fitted, [3, 3, 3]);
    expect(constant.rsquared).toBe(0);
    // An all-zero x: a zero slope (pseudo-inverse), the mean as intercept.
    close(ols([0, 0, 0], [1, 2, 6]).params, [3, 0]);
  });

  it('p-values: the t distribution through the incomplete beta function', () => {
    // t_{0.975, 10} = 2.228138851986: two-sided p = 0.05; t_{0.995, 30} = 2.749995653.
    expect(studentTTwoSided(2.228138851986, 10)).toBeCloseTo(0.05, 10);
    expect(studentTTwoSided(-2.749995653, 30)).toBeCloseTo(0.01, 6);
    // 1 df is Cauchy: p = 1 − 2 atan(|t|) / π.
    expect(studentTTwoSided(3, 1)).toBeCloseTo(1 - (2 * Math.atan(3)) / Math.PI, 12);
    expect(regularizedBeta(0.3, 2, 3)).toBeCloseTo(0.3483, 12);
    expect(studentTTwoSided(Infinity, 5)).toBe(0);
  });

  it('residuals are orthogonal to the design (property)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.double({ min: -100, max: 100, noNaN: true }),
            fc.double({ min: -100, max: 100, noNaN: true }),
          ),
          { minLength: 3, maxLength: 40 },
        ),
        (pairs) => {
          const x = pairs.map((p) => p[0]);
          const y = pairs.map((p) => p[1]);
          fc.pre(Math.max(...x) - Math.min(...x) > 1e-3 && Math.max(...y) - Math.min(...y) > 1e-3);
          const fit = ols(x, y);
          let sum = 0;
          let dot = 0;
          y.forEach((v, i) => {
            const r = v - (fit.fitted[i] as number);
            sum += r;
            dot += r * (x[i] as number);
          });
          const scale =
            1 + Math.max(...y.map(Math.abs)) * (1 + Math.max(...x.map(Math.abs))) * x.length;
          expect(Math.abs(sum) / scale).toBeLessThan(1e-9);
          expect(Math.abs(dot) / scale).toBeLessThan(1e-9);
          expect(fit.rsquared).toBeLessThanOrEqual(1 + 1e-12);
        },
      ),
    );
  });
});

describe('lowess (statsmodels / R lowess)', () => {
  it('matches R on the simple, iteration and frac fixtures', () => {
    close(lowess(simple['x'] as number[], simple['y'] as number[]), simple['out'] as number[], 7);
    close(
      lowess(iter['x'] as number[], iter['y'] as number[], { it: 0 }),
      iter['out_0'] as number[],
      7,
    );
    close(
      lowess(iter['x'] as number[], iter['y'] as number[], { it: 3 }),
      iter['out_3'] as number[],
      7,
    );
    close(
      lowess(frac['x'] as number[], frac['y'] as number[], { frac: 2 / 3 }),
      frac['out_2_3'] as number[],
      7,
    );
    close(
      lowess(frac['x'] as number[], frac['y'] as number[], { frac: 1 / 5 }),
      frac['out_1_5'] as number[],
      7,
    );
  });

  it('matches R with tied x and delta (motorcycle data)', () => {
    const x = delta['x'] as number[];
    const y = delta['y'] as number[];
    close(lowess(x, y, { frac: 0.1 }), delta['out_0'] as number[], 7);
    const range = Math.max(...x) - Math.min(...x);
    close(lowess(x, y, { frac: 0.1, delta: 0.01 * range }), delta['out_Rdef'] as number[], 7);
    close(lowess(x, y, { frac: 0.1, delta: 1 + 1e-10 }), delta['out_1'] as number[], 10);
  });

  it('keeps flat and linear data, returns input order, drops missing pairs', () => {
    const x = Array.from({ length: 20 }, (_, i) => i);
    close(
      lowess(
        x,
        x.map(() => 0),
      ),
      x.map(() => 0),
    );
    close(lowess(x, x), x);
    // Shuffled input: fitted values come back in the input's order.
    const order = [3, 0, 2, 1, 4, 19, 5, 18, 6, 17, 7, 16, 8, 15, 9, 14, 10, 13, 11, 12];
    const sx = order.map((i) => simple['x']?.[i] as number);
    const sy = order.map((i) => simple['y']?.[i] as number);
    close(
      lowess(sx, sy),
      order.map((i) => simple['out']?.[i] as number),
      7,
    );
    const withGap = lowess([0, 1, NaN, 2, 3], [0, 1, 5, 2, NaN]);
    expect(withGap[2]).toBeNaN();
    expect(withGap[4]).toBeNaN();
    expect(() => lowess([1, 2], [1, 2], { frac: 1.5 })).toThrow(RangeError);
  });
});

describe('rolling / expanding (pandas)', () => {
  const s = [1, 2, NaN, 4, 5, 6];

  it('windows of observations: min_periods defaults to the window, NaN take positions', () => {
    close(rolling(s, { window: 2 }), [NaN, 1.5, NaN, NaN, 4.5, 5.5]);
    close(rolling(s, { window: 3, minPeriods: 1 }), [1, 1.5, 1.5, 3, 4.5, 5]);
    close(rolling(s, { window: 3, minPeriods: 2 }, 'sum'), [NaN, 3, 3, 6, 9, 15]);
    close(rolling(s, { window: 3, minPeriods: 1 }, 'count'), [1, 2, 2, 2, 2, 3]);
    close(rolling([5, 1, 4, 2, 3], { window: 3 }, 'median'), [NaN, NaN, 4, 2, 3]);
    close(rolling([5, 1, 4, 2, 3], { window: 3 }, 'min'), [NaN, NaN, 1, 1, 2]);
    close(rolling([5, 1, 4, 2, 3], { window: 3 }, 'max'), [NaN, NaN, 5, 4, 4]);
    // Sample std (n − 1), ddof in functionArgs.
    close(rolling([1, 2, 4], { window: 3 }, 'std'), [NaN, NaN, Math.sqrt(7 / 3)]);
    close(rolling([1, 2, 4], { window: 3 }, 'var', { ddof: 0 }), [NaN, NaN, 14 / 9]);
    close(
      rolling([1, 2, 4, 8], { window: 2 }, (v) => v[v.length - 1]! - v[0]!),
      [NaN, 1, 2, 4],
    );
    expect(() => rolling(s, { window: 2, minPeriods: 3 })).toThrow(/must be <= window/);
  });

  it('centered windows ([i − 2, i + 1] for an even window) and weighted windows', () => {
    close(rolling([1, 2, 3, 4, 5], { window: 3, center: true }), [NaN, 2, 3, 4, NaN]);
    close(
      rolling([1, 2, 3, 4, 5], { window: 4, center: true, minPeriods: 1 }),
      [1.5, 2, 2.5, 3.5, 4],
    );
    // triang(3) = [0.5, 1, 0.5]: weighted mean of [1, 2, 4] = (0.5 + 2 + 2) / 2.
    close(rolling([1, 2, 4], { window: 3, winType: 'triang' }), [NaN, NaN, 2.25]);
    close(rolling([1, 2, 4], { window: 3, winType: 'triang' }, 'sum'), [NaN, NaN, 4.5]);
    const g = Math.exp(-0.5 / 4); // gaussian(3, std=2) = [g, 1, g]
    close(rolling([1, 2, 4], { window: 3, winType: 'gaussian' }, 'mean', { std: 2 }), [
      NaN,
      NaN,
      (g + 2 + 4 * g) / (2 * g + 1),
    ]);
    // A missing value drops out with its weight; boxcar is the plain mean.
    close(rolling([1, NaN, 4], { window: 3, winType: 'triang', minPeriods: 2 }), [NaN, NaN, 2.5]);
    close(rolling([1, 2, 4], { window: 3, winType: 'boxcar' }), [NaN, NaN, 7 / 3]);
    expect(() => rolling([1], { window: 1, winType: 'gaussian' })).toThrow(/std/);
  });

  it('time-span windows over dates: (t − span, t], min_periods 1', () => {
    const day = 86_400_000;
    const times = [0, 1, 2, 5, 6].map((d) => d * day);
    close(rolling([1, 2, 3, 4, 5], { window: '2D' }, 'sum', {}, times), [1, 3, 5, 4, 9]);
    close(rolling([1, 2, 3, 4, 5], { window: '3D', minPeriods: 2 }, 'mean', {}, times), [
      NaN,
      1.5,
      2,
      NaN,
      4.5,
    ]);
    expect(offsetMs('12h')).toBe(12 * 3_600_000);
    expect(offsetMs('min')).toBe(60_000);
    expect(() => offsetMs('1M')).toThrow(/fixed time span/);
    expect(() => rolling([1], { window: '2D' })).toThrow(/dates/);
  });

  it('expanding: all present values so far, min_periods 1', () => {
    close(expanding(s), [1, 1.5, 1.5, 7 / 3, 3, 3.6]);
    close(expanding(s, { minPeriods: 3 }, 'sum'), [NaN, NaN, NaN, 7, 12, 18]);
    close(expanding([3, 1, 2]), [3, 2, 2]);
    close(expanding([3, 1, 2], {}, 'median'), [3, 2, 2]);
    close(expanding([3, 1, 2], {}, 'max'), [3, 3, 3]);
    close(expanding([3, 1, 2], {}, 'std'), [NaN, Math.SQRT2, 1]);
  });

  it('a rolling window as long as the series is the expanding statistic (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fc.double({ min: -1e3, max: 1e3, noNaN: true }), fc.constant(NaN)), {
          minLength: 1,
          maxLength: 30,
        }),
        fc.constantFrom('mean', 'sum', 'min', 'max', 'median', 'count', 'var') as fc.Arbitrary<
          'mean' | 'sum' | 'min' | 'max' | 'median' | 'count' | 'var'
        >,
        (values, fn) => {
          const a = rolling(values, { window: values.length, minPeriods: 1 }, fn);
          const b = expanding(values, { minPeriods: 1 }, fn);
          a.forEach((v, i) => {
            if (Number.isNaN(b[i] as number)) expect(v).toBeNaN();
            else expect(v).toBeCloseTo(b[i] as number, 6);
          });
        },
      ),
    );
  });
});

describe('ewm (pandas ExponentialMovingWindow)', () => {
  it('matches pandas documentation examples', () => {
    const ser = [1, 2, 3, 4];
    close(ewm(ser, { alpha: 0.2 }), [1, 1.555556, 2.147541, 2.775068], 6);
    close(ewm(ser, { alpha: 0.2 }, 'sum'), [1, 2.8, 5.24, 8.192], 10);
    close(ewm(ser, { alpha: 0.2 }, 'std'), [NaN, 0.707107, 0.995893, 1.27732], 6);
    close(ewm(ser, { alpha: 0.2 }, 'var'), [NaN, 0.5, 0.991803, 1.631547], 6);
    // DataFrame.ewm docs, B = [0, 1, 2, NaN, 4].
    const b = [0, 1, 2, NaN, 4];
    close(ewm(b, { com: 0.5 }), [0, 0.75, 1.615385, 1.615385, 3.670213], 6);
    close(ewm(b, { alpha: 2 / 3 }), [0, 0.75, 1.615385, 1.615385, 3.670213], 6);
    close(ewm(b, { com: 0.5, adjust: false }), [0, 0.666667, 1.555556, 1.555556, 3.650794], 6);
    close(ewm(b, { com: 0.5, ignoreNa: true }), [0, 0.75, 1.615385, 1.615385, 3.225], 6);
  });

  it('adjust=True is the normalized decaying sum (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -1e3, max: 1e3, noNaN: true }), { minLength: 1, maxLength: 25 }),
        fc.double({ min: 0.01, max: 1, noNaN: true }),
        (values, alpha) => {
          const out = ewm(values, { alpha });
          values.forEach((_, t) => {
            let num = 0;
            let den = 0;
            for (let i = 0; i <= t; i++) {
              const w = (1 - alpha) ** i;
              num += w * (values[t - i] as number);
              den += w;
            }
            expect(out[t]).toBeCloseTo(num / den, 6);
          });
        },
      ),
    );
  });

  it('min_periods, span / halflife / com, and argument checks', () => {
    close(ewm([1, NaN, 3], { alpha: 0.5, minPeriods: 2 }), [NaN, NaN, (0.25 + 3) / 1.25]);
    expect(centerOfMass({ span: 5 })).toBe(2);
    expect(centerOfMass({ alpha: 0.25 })).toBe(3);
    // halflife h: (1 − α)^h = 0.5.
    const com = centerOfMass({ halflife: 3 });
    expect((1 - 1 / (1 + com)) ** 3).toBeCloseTo(0.5, 12);
    expect(() => centerOfMass({})).toThrow(/pass one of/);
    expect(() => centerOfMass({ span: 3, alpha: 0.5 })).toThrow(/mutually exclusive/);
    expect(() => ewm([1], { alpha: 0 })).toThrow(/0 < alpha <= 1/);
    expect(() => ewm([1], { alpha: 0.5, adjust: false }, 'sum')).toThrow(/adjust=false/);
  });
});
