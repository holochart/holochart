/**
 * `histogram` calc: cumulative histograms (direction, `currentbin`, and density norms).
 *
 * Expected values are worked out by hand from plotly.js' definitions (`histogram/cumulative`'s
 * `cdf`, and `calcAllAutoBins`, which adds one bin for `currentbin` other than `include`), on
 * small integer samples whose bin counts are obvious.
 */
import { createScale, supplyDefaults, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import { createChartRegistry, type AxisInfo, type CrossTraceEntry } from '@mk7s/holochart-runtime';
import { bar } from '@mk7s/holochart-traces-basic';
import { describe, expect, it } from 'vitest';
import { histogram, type HistogramCalc } from './index.ts';

const registry = createChartRegistry().register(bar, histogram);

/** Defaults, calc and cross-trace calc of one histogram, like the runtime. */
function calcOf(trace: Record<string, unknown>): HistogramCalc {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'histogram', ...trace }], layout: {} },
    registry.core,
  );
  const axis = (id: 'x' | 'y'): AxisInfo => {
    const name = `${id}axis`;
    const full = (fullLayout as FullLayout)[name] as { type?: string } | undefined;
    const type = (full?.type ?? 'linear') as 'linear';
    const scale = createScale({ type, range: [0, 1] });
    return { id, name, letter: id, type, scale, full: full ?? { type } } as unknown as AxisInfo;
  };
  const xaxis = axis('x');
  const yaxis = axis('y');
  const full = fullData[0]!;
  const calc = (histogram.calc as (t: FullTrace, ctx: unknown) => HistogramCalc)(full, {
    fullLayout,
    index: 0,
    xaxis,
    yaxis,
  });
  const entries = [{ trace: full, index: 0, calc }] as CrossTraceEntry<HistogramCalc>[];
  (histogram.crossTraceCalc as (e: unknown, ctx: unknown) => void)(entries, {
    fullLayout,
    xaxis,
    yaxis,
    subplot: {},
  });
  return calc;
}

/** Bin centers (data units) and bar values of a calc. */
function centers(c: HistogramCalc): number[] {
  return Array.from(c.positionValues as ArrayLike<number>);
}
function values(c: HistogramCalc): number[] {
  return Array.from(c.bars.value);
}

function expectClose(actual: number[], expected: number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((v, k) => expect(v).toBeCloseTo(expected[k]!, 12));
}

// Integers in bins of 1: Plotly's automatic start sits half a unit below the minimum, so the
// edges are 0.5, 1.5, 2.5, 3.5, 4.5 and the counts per bin are [2, 1, 0, 3].
const X = [1, 1, 2, 4, 4, 4];
const BASE = { x: X, xbins: { size: 1 } };

describe('histogram calc: cumulative direction', () => {
  it('sums the bins to the left, its own included (increasing, include)', () => {
    const c = calcOf({ ...BASE, cumulative: { enabled: true } });
    expect(centers(c)).toEqual([1, 2, 3, 4]);
    expect(values(c)).toEqual([2, 3, 3, 6]);
    expect(c.cumulative).toBe(true);
    expect(c.binned).toBe(6);
  });

  it('sums the bins to the right, its own included (decreasing, include)', () => {
    const c = calcOf({ ...BASE, cumulative: { enabled: true, direction: 'decreasing' } });
    expect(centers(c)).toEqual([1, 2, 3, 4]);
    expect(values(c)).toEqual([6, 4, 3, 3]);
  });

  it('carries no samples per bar and labels each bar by its bin center', () => {
    const c = calcOf({ ...BASE, cumulative: { enabled: true, direction: 'decreasing' } });
    expect(c.points).toEqual([[], [], [], []]);
    expect(Array.from(c.hover0)).toEqual([1, 2, 3, 4]);
    expect(Array.from(c.hover1)).toEqual([1, 2, 3, 4]);
    // Samples still map to the bar of their bin (selection).
    expect(Array.from(c.barOfSample)).toEqual([0, 0, 1, 3, 3, 3]);
  });
});

describe('histogram calc: cumulative currentbin', () => {
  it('exclude, increasing: adds a bin after the data, and each bar sums the bins before it', () => {
    const c = calcOf({ ...BASE, cumulative: { enabled: true, currentbin: 'exclude' } });
    // Counts [2, 1, 0, 3, 0] → running sums shifted right [0, 2, 3, 3, 6]; the empty first bin
    // is dropped like any empty bin at an end.
    expect(centers(c)).toEqual([2, 3, 4, 5]);
    expect(values(c)).toEqual([2, 3, 3, 6]);
    expect(Array.from(c.binStart)).toEqual([1.5, 2.5, 3.5, 4.5]);
    expect(Array.from(c.binEnd)).toEqual([2.5, 3.5, 4.5, 5.5]);
  });

  it('exclude, decreasing: adds a bin before the data, and each bar sums the bins after it', () => {
    const c = calcOf({
      ...BASE,
      cumulative: { enabled: true, currentbin: 'exclude', direction: 'decreasing' },
    });
    // Counts [0, 2, 1, 0, 3] → sums from the right shifted left [6, 4, 3, 3, 0].
    expect(centers(c)).toEqual([0, 1, 2, 3]);
    expect(values(c)).toEqual([6, 4, 3, 3]);
  });

  it('half, increasing: counts half of the current bin on top of the bins before it', () => {
    const c = calcOf({ ...BASE, cumulative: { enabled: true, currentbin: 'half' } });
    // Counts [2, 1, 0, 3, 0] → [2/2, 2 + 1/2, 3 + 0, 3 + 3/2, 6 + 0].
    expect(centers(c)).toEqual([1, 2, 3, 4, 5]);
    expect(values(c)).toEqual([1, 2.5, 3, 4.5, 6]);
  });

  it('half, decreasing: counts half of the current bin on top of the bins after it', () => {
    const c = calcOf({
      ...BASE,
      cumulative: { enabled: true, currentbin: 'half', direction: 'decreasing' },
    });
    // Counts [0, 2, 1, 0, 3] → from the right [6 + 0, 4 + 2/2, 3 + 1/2, 3 + 0, 3/2].
    expect(centers(c)).toEqual([0, 1, 2, 3, 4]);
    expect(values(c)).toEqual([6, 5, 3.5, 3, 1.5]);
  });

  it('keeps explicit bin bounds: no bin is added, so exclude never reaches the total', () => {
    const c = calcOf({
      x: X,
      xbins: { start: 0.5, end: 4.5, size: 1 },
      cumulative: { enabled: true, currentbin: 'exclude' },
    });
    // Counts [2, 1, 0, 3] → shifted running sums [0, 2, 3, 3]; the empty first bin is dropped.
    expect(centers(c)).toEqual([2, 3, 4]);
    expect(values(c)).toEqual([2, 3, 3]);
  });
});

describe('histogram calc: cumulative with a density norm', () => {
  // Bins of 2 from 0 to 8: counts [2, 1, 3, 1] of 7 samples.
  const WIDE = { x: [1, 1, 2, 4, 4, 4, 7], xbins: { start: 0, end: 8, size: 2 } };

  it('divides by the bin width without cumulative (the reference for the next two)', () => {
    expect(values(calcOf({ ...WIDE, histnorm: 'density' }))).toEqual([1, 0.5, 1.5, 0.5]);
    expectClose(values(calcOf({ ...WIDE, histnorm: 'probability density' })), [
      2 / 14,
      1 / 14,
      3 / 14,
      1 / 14,
    ]);
  });

  it('density accumulates the plain counts (an integral: the width cancels)', () => {
    const c = calcOf({ ...WIDE, histnorm: 'density', cumulative: { enabled: true } });
    expect(centers(c)).toEqual([1, 3, 5, 7]);
    expect(values(c)).toEqual([2, 3, 6, 7]);
  });

  it('probability density accumulates probabilities and reaches 1', () => {
    const c = calcOf({ ...WIDE, histnorm: 'probability density', cumulative: { enabled: true } });
    expectClose(values(c), [2 / 7, 3 / 7, 6 / 7, 1]);
    const same = calcOf({ ...WIDE, histnorm: 'probability', cumulative: { enabled: true } });
    expectClose(values(c), values(same));
  });

  it('probability density, decreasing: falls from 1', () => {
    const c = calcOf({
      ...WIDE,
      histnorm: 'probability density',
      cumulative: { enabled: true, direction: 'decreasing' },
    });
    expectClose(values(c), [1, 5 / 7, 4 / 7, 1 / 7]);
  });
});
