/**
 * `histogram` calc: which samples are binned and which bins become bars (samples outside the bins,
 * empty bins at the ends and in the middle, aggregates without samples, log position axes).
 *
 * Expected values are worked out by hand on small samples with explicit bins, from plotly.js'
 * histogram calc: bins are `[start + k·size, start + (k + 1)·size)`, empty bins at both ends are
 * dropped, and a bin whose aggregate is not a number (`min` / `max` / `avg` of nothing) has no bar.
 */
import { createScale, supplyDefaults, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import { createChartRegistry, type AxisInfo, type CrossTraceEntry } from '@mk7s/holochart-runtime';
import { bar } from '@mk7s/holochart-traces-basic';
import { describe, expect, it } from 'vitest';
import { histogram, type HistogramCalc } from './index.ts';

const registry = createChartRegistry().register(bar, histogram);

/** Defaults, calc and cross-trace calc of one histogram, like the runtime. */
function calcOf(
  trace: Record<string, unknown>,
  layout: Record<string, unknown> = {},
): HistogramCalc {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'histogram', ...trace }], layout },
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

function centers(c: HistogramCalc): number[] {
  return Array.from(c.positionValues as ArrayLike<number>);
}
function values(c: HistogramCalc): number[] {
  return Array.from(c.bars.value);
}

describe('histogram calc: samples outside the bins', () => {
  it('leaves out samples below the first bin, past the last one, and unusable ones', () => {
    // Bins [2, 6) and [6, 10): 1 is below, 12 is past the end, null and NaN are not numbers.
    const c = calcOf(
      { x: [1, 2.5, null, NaN, 7, 12], xbins: { start: 2, end: 10, size: 4 } },
      { xaxis: { type: 'linear' } },
    );
    expect(Array.from(c.binStart)).toEqual([2, 6]);
    expect(Array.from(c.binEnd)).toEqual([6, 10]);
    expect(centers(c)).toEqual([4, 8]);
    expect(values(c)).toEqual([1, 1]);
    expect(c.binned).toBe(2);
    expect(c.points).toEqual([[1], [4]]);
    expect(Array.from(c.barOfSample)).toEqual([-1, 0, -1, -1, 1, -1]);
    // One distinct value per bin: hover shows that value, not a range.
    expect(Array.from(c.hover0)).toEqual([2.5, 7]);
    expect(Array.from(c.hover1)).toEqual([2.5, 7]);
  });

  it('counts a sample on a bin edge in the bin that starts there', () => {
    const c = calcOf({ x: [2, 6, 6, 10], xbins: { start: 2, end: 10, size: 4 } });
    // 10 is the end of the last bin, so outside it.
    expect(values(c)).toEqual([1, 2]);
    expect(Array.from(c.barOfSample)).toEqual([0, 1, 1, -1]);
    expect(c.binned).toBe(3);
  });
});

describe('histogram calc: empty bins', () => {
  it('drops empty bins at both ends and keeps the ones in between as zero bars', () => {
    // Bins of 2 from 0 to 12: counts [0, 0, 2, 0, 1, 0].
    const c = calcOf({ x: [5, 5.5, 8], xbins: { start: 0, end: 12, size: 2 } });
    expect(c.length).toBe(3);
    expect(centers(c)).toEqual([5, 7, 9]);
    expect(values(c)).toEqual([2, 0, 1]);
    expect(Array.from(c.binStart)).toEqual([4, 6, 8]);
    expect(Array.from(c.binEnd)).toEqual([6, 8, 10]);
    expect(c.points).toEqual([[0, 1], [], [2]]);
    // Bars are numbered after the dropped bins.
    expect(Array.from(c.barOfSample)).toEqual([0, 0, 2]);
    // The whole bin grid is still reported.
    expect(c.spec).toEqual({ start: 0, end: 12, size: 2 });
  });
});

describe('histogram calc: histfunc over bins without samples', () => {
  // Bins of 1 from 0 to 4; y per bin: [5], [2, 8], [], [1, 4].
  const DATA = {
    x: [0.5, 1.5, 1.7, 3.2, 3.9],
    y: [5, 2, 8, 1, 4],
    xbins: { start: 0, end: 4, size: 1 },
  };

  it('sum keeps the empty bin as a zero bar', () => {
    const c = calcOf({ ...DATA, histfunc: 'sum' });
    expect(centers(c)).toEqual([0.5, 1.5, 2.5, 3.5]);
    expect(values(c)).toEqual([5, 10, 0, 5]);
  });

  it.each([
    ['avg', [5, 5, 2.5]],
    ['min', [5, 2, 1]],
    ['max', [5, 8, 4]],
  ] as const)('%s has no bar for the empty bin (its value is not a number)', (histfunc, want) => {
    const c = calcOf({ ...DATA, histfunc });
    expect(c.length).toBe(3);
    expect(centers(c)).toEqual([0.5, 1.5, 3.5]);
    expect(values(c)).toEqual(want);
    expect(Array.from(c.binStart)).toEqual([0, 1, 3]);
    // Samples of the bins after the gap map to the renumbered bars.
    expect(Array.from(c.barOfSample)).toEqual([0, 1, 1, 2, 2]);
    expect(c.points).toEqual([[0], [1, 2], [3, 4]]);
    expect(c.binned).toBe(5);
  });

  it('ignores values that are not numbers when aggregating', () => {
    const c = calcOf({ ...DATA, y: [5, 'n/a', 8, null, 4], histfunc: 'avg' });
    // y per bin: [5], [8], [], [4].
    expect(centers(c)).toEqual([0.5, 1.5, 3.5]);
    expect(values(c)).toEqual([5, 8, 4]);
  });

  it('aggregates x for horizontal histograms', () => {
    const c = calcOf({
      y: [1, 1, 2, 4],
      x: [10, 5, 7, 1],
      orientation: 'h',
      histfunc: 'sum',
      ybins: { start: 0.5, end: 4.5, size: 1 },
    });
    expect(c.orientation).toBe('h');
    expect(centers(c)).toEqual([1, 2, 3, 4]);
    expect(values(c)).toEqual([15, 7, 0, 1]);
  });
});

describe('histogram calc: log position axis', () => {
  const LOG = { xaxis: { type: 'log' } };

  it('bins raw values in equal data-unit bins and places bars at log10 of the bin centers', () => {
    // `xbins.start` / `end` are exponents on a log axis (range units): bins run from 10^0 = 1 to
    // 10^2 = 100 in steps of 20 data units: [1, 21), [21, 41), [41, 61), [61, 81), [81, 101).
    const c = calcOf(
      { x: [1, 5, 20, 30, 90, 100, 150], xbins: { start: 0, end: 2, size: 20 } },
      LOG,
    );
    expect(c.posType).toBe('log');
    expect(Array.from(c.binStart)).toEqual([1, 21, 41, 61, 81]);
    expect(Array.from(c.binEnd)).toEqual([21, 41, 61, 81, 101]);
    expect(centers(c)).toEqual([11, 31, 51, 71, 91]);
    expect(values(c)).toEqual([3, 1, 0, 0, 2]);
    expect(Array.from(c.pos)).toEqual([11, 31, 51, 71, 91].map((v) => Math.log10(v)));
    expect(Array.from(c.barOfSample)).toEqual([0, 0, 0, 1, 4, 4, -1]);
  });

  it('gives bins centered at or below zero no position on the axis', () => {
    // Integers in bins of 10: Plotly's automatic start is half a unit below a multiple of 10, so
    // the edges are -20.5, -10.5, -0.5, 9.5, …, 59.5 and the counts [2, 0, 1, 0, 0, 0, 0, 2].
    const c = calcOf({ x: [-15, -12, 5, 50, 55], xbins: { size: 10 } }, LOG);
    const want = [-15.5, -5.5, 4.5, 14.5, 24.5, 34.5, 44.5, 54.5];
    expect(centers(c)).toEqual(want);
    // The bin values themselves (before the bar layout, which cannot place the first two).
    expect(Array.from(c.size)).toEqual([2, 0, 1, 0, 0, 0, 0, 2]);
    expect(c.binned).toBe(5);
    const pos = Array.from(c.pos);
    expect(pos.slice(0, 2)).toEqual([NaN, NaN]);
    expect(pos.slice(2)).toEqual(want.slice(2).map((v) => Math.log10(v)));
  });
});
