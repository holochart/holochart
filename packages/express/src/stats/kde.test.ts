/**
 * KDE and normal fits (plan E10.8) against scipy's definitions: `gaussian_kde` with Scott's rule
 * uses the samples' covariance (n − 1) times `n^(−2/(d+4))` as the kernel covariance, and
 * `norm.fit` is the maximum-likelihood fit (standard deviation with n). Reference values for the
 * samples [1, 2, 3, 4, 7] computed from those definitions in double precision.
 */
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { distplot, fitNormal, gaussianKde, normalPdf } from '../index.ts';

describe('gaussianKde (scipy gaussian_kde, Scott)', () => {
  const kde = gaussianKde([1, 2, 3, 4, 7]);

  it('matches the reference bandwidth and densities', () => {
    expect(kde.bandwidth).toBeCloseTo(1.6685680905099418, 12);
    const expected: [number, number][] = [
      [0, 0.07547910495237428],
      [2.5, 0.1565442015223548],
      [4, 0.13008667500244944],
      [7, 0.060629799069740045],
      [10, 0.009580361232003665],
    ];
    for (const [x, p] of expected) expect(kde.pdf(x)).toBeCloseTo(p, 12);
  });

  it('ignores non-finite samples and rejects degenerate ones', () => {
    expect(gaussianKde([1, 2, NaN, 3, 4, 7, null as never]).pdf(4)).toBeCloseTo(kde.pdf(4), 12);
    expect(() => gaussianKde([1])).toThrow(/two finite samples/);
    expect(() => gaussianKde([2, 2, 2])).toThrow(/zero variance/);
  });

  it('integrates to 1 (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 30 }),
        (samples) => {
          fc.pre(Math.max(...samples) - Math.min(...samples) > 1e-6);
          const k = gaussianKde(samples);
          const lo = Math.min(...samples) - 8 * k.bandwidth;
          const hi = Math.max(...samples) + 8 * k.bandwidth;
          const n = 4000;
          const h = (hi - lo) / n;
          let area = 0;
          for (let i = 0; i < n; i++) area += k.pdf(lo + (i + 0.5) * h) * h;
          expect(area).toBeCloseTo(1, 3);
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe('fitNormal (scipy norm.fit)', () => {
  it('uses the population standard deviation', () => {
    const { mean, sd } = fitNormal([1, 2, 3, 4, 7]);
    expect(mean).toBeCloseTo(3.4, 12);
    expect(sd).toBeCloseTo(2.0591260281974, 12);
    expect(normalPdf(4, mean, sd)).toBeCloseTo(0.18569068043520554, 12);
  });
});

describe('distplot (plotly.py create_distplot)', () => {
  const a = [1, 2, 3, 4, 7];
  const b = [2, 2.5, 3, 5];

  it('builds histograms, curves and rugs with create_distplot layout', () => {
    const f = distplot([a, b], ['A', 'B'], { binSize: [1, 0.5], colors: ['red', 'blue'] });
    expect(f.data.map((t) => [t['type'], t['name'], t['yaxis'], t['showlegend']])).toEqual([
      ['histogram', 'A', 'y', undefined],
      ['histogram', 'B', 'y', undefined],
      ['scatter', 'A', 'y', false],
      ['scatter', 'B', 'y', false],
      ['scatter', 'A', 'y2', false],
      ['scatter', 'B', 'y2', false],
    ]);
    expect(f.data[1]).toMatchObject({
      histnorm: 'probability density',
      autobinx: false,
      xbins: { start: 2, end: 5, size: 0.5 },
      opacity: 0.7,
      marker: { color: 'blue' },
    });
    const curve = f.data[2] as { x: number[]; y: number[] };
    expect(curve.x).toHaveLength(500);
    expect(curve.x[0]).toBe(1);
    expect(curve.x[100]).toBeCloseTo(1 + (100 * 6) / 500, 12);
    expect(curve.y[100]).toBeCloseTo(gaussianKde(a).pdf(curve.x[100] as number), 12);
    expect(f.data[4]).toMatchObject({
      mode: 'markers',
      y: ['A', 'A', 'A', 'A', 'A'],
      marker: { color: 'red', symbol: 'line-ns-open' },
    });
    expect(f.layout).toEqual({
      barmode: 'overlay',
      hovermode: 'closest',
      legend: { traceorder: 'reversed' },
      xaxis: { domain: [0, 1], anchor: 'y2', zeroline: false },
      yaxis: { domain: [0.35, 1], anchor: 'free', position: 0 },
      yaxis2: { domain: [0, 0.25], anchor: 'x', dtick: 1, showticklabels: false },
    });
  });

  it('fits normal curves, scales them for probability histograms, and drops parts', () => {
    const f = distplot([a], ['A'], {
      curveType: 'normal',
      histnorm: 'probability',
      binSize: 2,
      showRug: false,
    });
    expect(f.data.map((t) => t['type'])).toEqual(['histogram', 'scatter']);
    const curve = f.data[1] as { x: number[]; y: number[] };
    const { mean, sd } = fitNormal(a);
    expect(curve.y[0]).toBeCloseTo(2 * normalPdf(1, mean, sd), 12);
    expect(f.layout['yaxis']).toEqual({ domain: [0, 1], anchor: 'free', position: 0 });
    expect(f.layout).not.toHaveProperty('yaxis2');
    const only = distplot([a], ['A'], { showHist: false, showCurve: false });
    expect(only.data.map((t) => [t['type'], t['showlegend']])).toEqual([['scatter', true]]);
  });

  it('colors from the template colorway by default and validates its input', () => {
    const f = distplot([a], ['A'], { template: 'plotly-classic' });
    expect(f.data[0]?.['marker']).toEqual({ color: '#1f77b4' });
    expect(f.layout['template']).toBe('plotly-classic');
    expect(() => distplot([a, b], ['A'])).toThrow(/one label per sample set/);
    expect(() => distplot([], [])).toThrow(/at least one array/);
    expect(() => distplot([a], ['A'], { curveType: 'box' as never })).toThrow(/curveType/);
  });
});
