import { describe, expect, it } from 'vitest';
import {
  boxStats,
  distinctValues,
  findBin,
  interp,
  jitterOffsets,
  kdeAt,
  kdeBandwidth,
  kdeGrid,
  kdeSpan,
  lowerFence,
  notchSpan,
  outlierBounds,
  pseudoRandom,
  quartiles,
  silvermanBandwidth,
  upperFence,
} from './stats.ts';

const NINE = [1, 2, 3, 4, 5, 6, 7, 8, 9];

describe('quartiles (plotly.js quartilemethod)', () => {
  // Plotly's docs ("Choosing The Algorithm For Computing Quartiles") use 1…9.
  it('linear interpolates like Lib.interp (p·n − 0.5)', () => {
    expect(quartiles(NINE, 'linear')).toEqual({ q1: 2.75, median: 5, q3: 7.25 });
  });

  it('exclusive takes the halves without the median for odd counts', () => {
    expect(quartiles(NINE, 'exclusive')).toEqual({ q1: 2.5, median: 5, q3: 7.5 });
  });

  it('inclusive takes the halves with the median for odd counts', () => {
    expect(quartiles(NINE, 'inclusive')).toEqual({ q1: 3, median: 5, q3: 7 });
  });

  it('uses linear for even counts in every method', () => {
    const even = [1, 2, 3, 4, 5, 6, 7, 8];
    const linear = quartiles(even, 'linear');
    expect(linear).toEqual({ q1: 2.5, median: 4.5, q3: 6.5 });
    expect(quartiles(even, 'exclusive')).toEqual(linear);
    expect(quartiles(even, 'inclusive')).toEqual(linear);
  });

  it('works on a sub-range of a larger array', () => {
    const padded = [-100, ...NINE, 100];
    expect(quartiles(padded, 'exclusive', 1, 10)).toEqual(quartiles(NINE, 'exclusive'));
  });

  it('interp clamps to the ends and handles one sample', () => {
    expect(interp([4], 0.25)).toBe(4);
    expect(interp([1, 3], 0)).toBe(1);
    expect(interp([1, 3], 1)).toBe(3);
    expect(interp([1, 3], 0.5)).toBe(2);
    expect(interp([], 0.5)).toBeNaN();
  });
});

describe('fences and outliers', () => {
  const data = [-10, 1, 2, 3, 4, 5, 6, 7, 8, 30];

  it('whiskers end at the last samples within 1.5 IQR', () => {
    const { q1, q3 } = quartiles(data);
    // q1 = 2, q3 = 7 → 1.5 IQR = 7.5 → bounds −5.5 and 14.5.
    expect([q1, q3]).toEqual([2, 7]);
    expect(lowerFence(data, q1, q3)).toBe(1);
    expect(upperFence(data, q1, q3)).toBe(8);
    expect(outlierBounds(q1, q3)).toEqual([-13, 22]);
  });

  it('never moves a fence inside the box', () => {
    // Every sample is below q1 − 1.5 IQR except the box itself: the fence is q1.
    expect(lowerFence([0, 10, 10, 10], 10, 10)).toBe(10);
    expect(upperFence([0, 0, 0, 10], 0, 0)).toBe(0);
    expect(lowerFence([], 3, 5)).toBe(3);
    expect(upperFence([], 3, 5)).toBe(5);
  });

  it('boxStats collects everything with the population sd', () => {
    const s = boxStats(data);
    expect(s).toMatchObject({ n: 10, min: -10, max: 30, q1: 2, median: 4.5, q3: 7 });
    expect(s.lowerFence).toBe(1);
    expect(s.upperFence).toBe(8);
    expect(s.mean).toBeCloseTo(5.6, 12);
    const m = 5.6;
    const pop = Math.sqrt(data.reduce((a, v) => a + (v - m) ** 2, 0) / data.length);
    expect(s.sd).toBeCloseTo(pop, 12);
    expect(s.notchSpan).toBeCloseTo((1.57 * 5) / Math.sqrt(10), 12);
  });

  it('notch span is 0 without samples', () => {
    expect(notchSpan(1, 2, 0)).toBe(0);
  });

  it('findBin matches Lib.findBin on edges', () => {
    const edges = [0, 1, 2, 3];
    expect(findBin(1, edges)).toBe(1);
    expect(findBin(1, edges, true)).toBe(0);
    expect(findBin(-1, edges)).toBe(-1);
    expect(findBin(5, edges)).toBe(3);
  });
});

describe('kernel density', () => {
  const samples = [1.2, 2.3, 2.9, 3.1, 3.4, 4.8, 5.0, 5.5, 6.1, 7.7, 8.0];

  it('Silverman bandwidth follows Plotly’s formula', () => {
    expect(silvermanBandwidth(100, 2, 4)).toBeCloseTo(1.059 * Math.min(2, 4 / 1.349) * 100 ** -0.2);
    const s = boxStats(samples);
    const n = samples.length;
    const ssd = Math.sqrt(samples.reduce((a, v) => a + (v - s.mean) ** 2, 0) / (n - 1));
    const expected = Math.max(1.059 * Math.min(ssd, (s.q3 - s.q1) / 1.349) * n ** -0.2, 6.8 / 100);
    expect(kdeBandwidth(samples, s)).toBeCloseTo(expected, 12);
  });

  it('keeps user bandwidths above span/1e4 and handles equal samples', () => {
    const s = boxStats(samples);
    expect(kdeBandwidth(samples, s, 0.5)).toBe(0.5);
    expect(kdeBandwidth(samples, s, 1e-9)).toBeCloseTo((8 - 1.2) / 1e4, 12);
    const flat = boxStats([3, 3, 3]);
    expect(kdeBandwidth([3, 3, 3], flat)).toBe(0);
    expect(kdeBandwidth([3, 3, 3], flat, 0.2)).toBe(0.2);
  });

  it('integrates to about 1', () => {
    const h = kdeBandwidth(samples, boxStats(samples));
    const lo = -10;
    const hi = 20;
    const steps = 6000;
    const dx = (hi - lo) / steps;
    let area = 0;
    for (let i = 0; i < steps; i++) area += kdeAt(samples, h, lo + (i + 0.5) * dx) * dx;
    expect(area).toBeCloseTo(1, 6);
  });

  it('grids the span in steps of at most h/3, both ends included', () => {
    const grid = kdeGrid(samples, 0.6, [0, 9])!;
    expect(grid.t.length).toBe(Math.ceil(9 / (0.6 / 3)) + 1);
    expect(grid.t[0]).toBe(0);
    expect(grid.t[grid.t.length - 1]).toBeCloseTo(9, 9);
    expect(grid.max).toBe(Math.max(...grid.v));
    expect(grid.v[10]).toBeCloseTo(kdeAt(samples, 0.6, grid.t[10]!), 12);
    expect(kdeGrid([3, 3], 0, [3, 3])).toEqual({
      t: Float64Array.of(3),
      v: Float64Array.of(1),
      max: 1,
    });
  });

  it('span modes: soft, hard, manual with soft fallbacks', () => {
    expect(kdeSpan('soft', 1, 5, 0.5)).toEqual([0, 6]);
    expect(kdeSpan('hard', 1, 5, 0.5)).toEqual([1, 5]);
    expect(kdeSpan('manual', 1, 5, 0.5, [-2, 9])).toEqual([-2, 9]);
    expect(kdeSpan('manual', 1, 5, 0.5, [NaN, 9])).toEqual([0, 9]);
    expect(kdeSpan('manual', 1, 5, 0.5)).toEqual([0, 6]);
  });
});

describe('positions and jitter', () => {
  it('distinctValues merges rounding noise and finds the smallest gap', () => {
    expect(distinctValues([3, 1, 2, 2 + 1e-12, NaN])).toEqual({ values: [1, 2, 3], minDiff: 1 });
    expect(distinctValues([5])).toEqual({ values: [5], minDiff: 1 });
    expect(distinctValues([0, 10, 12])).toEqual({ values: [0, 10, 12], minDiff: 2 });
  });

  it('pseudoRandom repeats Plotly’s sequence from its seed', () => {
    const a = pseudoRandom();
    const b = pseudoRandom();
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    for (const v of first) expect(v).toBeGreaterThanOrEqual(0);
    for (const v of first) expect(v).toBeLessThan(1);
    // (69069 · 2e9 + 1) mod 2³² is far enough from the seed to be the first value.
    expect(first[0]).toBe(((69069 * 2000000000 + 1) % 4294967296) / 4294967296);
  });

  it('jitter stays within ±jitter box half-widths and is 0 without jitter', () => {
    const values = [1, 1.1, 1.2, 1.3, 5, 9];
    const stats = boxStats(values);
    const off = jitterOffsets(values, stats, 0.5, false, pseudoRandom());
    for (const o of off) expect(Math.abs(o)).toBeLessThanOrEqual(0.5);
    expect(off.some((o) => o !== 0)).toBe(true);
    expect([...jitterOffsets(values, stats, 0, false, pseudoRandom())]).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
