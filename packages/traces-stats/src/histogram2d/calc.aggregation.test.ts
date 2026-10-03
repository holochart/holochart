/**
 * `histogram2d` calc: what each cell holds (`histfunc` over `z` or `marker.color`, `histnorm`),
 * on grids small enough to work every cell out by hand.
 *
 * Expected values follow plotly.js `histogram2d/calc.js`: cells are `z[j * nx + i]` for x bin `i`
 * and y bin `j`; `marker.color` is aggregated when there is no `z`; `percent` / `probability`
 * divide by the total over the grid, `density` by the cell area, `probability density` by both.
 */
import { createScale, supplyDefaults, type FullAxis, type FullLayout } from '@mk7s/holochart-core';
import { createChartRegistry, type AxisInfo, type CalcContext } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { histogram2dcontour } from '../histogram2dcontour/index.ts';
import { recordedZExtent } from './colorscale.ts';
import { histogram2d } from './index.ts';

const registry = createChartRegistry().register(histogram2d, histogram2dcontour);

function axis(fullLayout: FullLayout, id: 'x' | 'y'): AxisInfo {
  const scale = createScale({ type: 'linear', range: [-5, 5] });
  const full = { ...(fullLayout[`${id}axis`] as FullAxis), type: 'linear' } as FullAxis;
  return { id, name: `${id}axis`, letter: id, type: 'linear', scale, full } as unknown as AxisInfo;
}

/** Defaults and calc of one histogram2d trace, through the trace module. */
function calcOf(trace: Record<string, unknown>) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'histogram2d', ...trace }], layout: {} },
    registry.core,
  );
  const ctx: CalcContext = {
    fullLayout,
    index: 0,
    xaxis: axis(fullLayout, 'x'),
    yaxis: axis(fullLayout, 'y'),
  };
  const full = fullData[0]!;
  return { trace: full, calc: histogram2d.calc!(full, ctx) };
}

/** Two x bins and two y bins around the integers 0 and 1. */
const UNIT = {
  xbins: { start: -0.5, end: 1.5, size: 1 },
  ybins: { start: -0.5, end: 1.5, size: 1 },
};
// Samples per cell (x bin, y bin): (0, 0) ← #0, #1; (1, 0) ← #2; (0, 1) ← none; (1, 1) ← #3, #4.
const X = [0, 0, 1, 1, 1];
const Y = [0, 0, 0, 1, 1];
const W = [1, 2, 3, 4, 6];

function expectCells(actual: Float64Array, expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((v, c) => {
    if (Number.isNaN(v)) expect(actual[c]).toBeNaN();
    else expect(actual[c]).toBeCloseTo(v, 12);
  });
}

describe('histogram2d calc: histfunc over marker.color', () => {
  it.each([
    ['sum', [3, 3, 0, 10], [0, 10]],
    ['avg', [1.5, 3, NaN, 5], [1.5, 5]],
    ['min', [1, 3, NaN, 4], [1, 4]],
    ['max', [2, 3, NaN, 6], [2, 6]],
  ] as const)('aggregates a marker.color array with %s when there is no z', (func, want, ext) => {
    const { calc, trace } = calcOf({ x: X, y: Y, marker: { color: W }, histfunc: func, ...UNIT });
    expect(calc.histfunc).toBe(func);
    expect([calc.nx, calc.ny]).toEqual([2, 2]);
    expectCells(calc.z, want);
    // The value extent skips empty cells and is what the colorbar reads.
    expect(calc.zExtent).toEqual(ext);
    expect(recordedZExtent(trace)).toEqual(ext);
    // The samples of each cell, in sample order.
    expect(Array.from(calc.cellStart)).toEqual([0, 2, 3, 3, 5]);
    expect(Array.from(calc.cellPoints)).toEqual([0, 1, 2, 3, 4]);
    expect(calc.binned).toBe(5);
  });

  it('prefers z over marker.color', () => {
    const z = [10, 20, 30, 40, 60];
    const { calc } = calcOf({ x: X, y: Y, z, marker: { color: W }, histfunc: 'sum', ...UNIT });
    expectCells(calc.z, [30, 30, 0, 100]);
  });

  it('counts samples with a single marker.color (nothing to aggregate)', () => {
    const { calc } = calcOf({ x: X, y: Y, marker: { color: 'red' }, histfunc: 'sum', ...UNIT });
    expect(calc.histfunc).toBe('count');
    expectCells(calc.z, [2, 1, 0, 2]);
  });

  it('reports one hover value per bin when the samples of each bin share it', () => {
    const { calc } = calcOf({ x: X, y: Y, marker: { color: W }, histfunc: 'sum', ...UNIT });
    // `[lo, hi]` per bin: every x sample of bin 0 is 0, of bin 1 is 1 (same along y).
    expect(Array.from(calc.x.ranges)).toEqual([0, 0, 1, 1]);
    expect(Array.from(calc.y.ranges)).toEqual([0, 0, 1, 1]);
  });
});

describe('histogram2d calc: histnorm per cell', () => {
  // Cells are 2 wide and 5 high (area 10). Counts, row-major: [2, 0, 1, 1] of 4 samples.
  const DATA = {
    x: [0, 0, 1, 3],
    y: [0, 1, 7, 8],
    xbins: { start: 0, end: 4, size: 2 },
    ybins: { start: 0, end: 10, size: 5 },
  };

  it.each([
    ['', [2, 0, 1, 1]],
    ['percent', [50, 0, 25, 25]],
    ['probability', [0.5, 0, 0.25, 0.25]],
    ['density', [0.2, 0, 0.1, 0.1]],
    ['probability density', [0.05, 0, 0.025, 0.025]],
  ] as const)('histnorm "%s"', (histnorm, want) => {
    const { calc } = calcOf({ ...DATA, histnorm });
    expect(Array.from(calc.x.edges)).toEqual([0, 2, 4]);
    expect(Array.from(calc.y.edges)).toEqual([0, 5, 10]);
    expectCells(calc.z, want);
    expect(calc.zExtent[0]).toBeCloseTo(Math.min(...want), 12);
    expect(calc.zExtent[1]).toBeCloseTo(Math.max(...want), 12);
  });

  it('normalizes sums by the total of the aggregated values', () => {
    const { calc } = calcOf({
      x: X,
      y: Y,
      z: W,
      histfunc: 'sum',
      histnorm: 'percent',
      ...UNIT,
    });
    // Sums [3, 3, 0, 10] of a total of 16.
    expectCells(calc.z, [18.75, 18.75, 0, 62.5]);
  });

  it('normalizes averages by the sum of the cell averages; empty cells become 0', () => {
    const { calc } = calcOf({
      x: X,
      y: Y,
      z: W,
      histfunc: 'avg',
      histnorm: 'probability',
      ...UNIT,
    });
    // Averages [1.5, 3, –, 5] add up to 9.5.
    expectCells(calc.z, [1.5 / 9.5, 3 / 9.5, 0, 5 / 9.5]);
    expect(calc.zExtent[0]).toBe(0);
  });
});

describe('histogram2d calc: sample pairs', () => {
  it('bins only the leading samples that have both x and y', () => {
    // Three y for five x: samples #3 and #4 are not binned.
    const { calc, trace } = calcOf({ x: X, y: [0, 0, 0], ...UNIT });
    expect(trace['_length']).toBe(3);
    expectCells(calc.z, [2, 1, 0, 0]);
    expect(calc.binned).toBe(3);
    expect(Array.from(calc.cellPoints)).toEqual([0, 1, 2]);
  });

  it('skips pairs with an unusable coordinate', () => {
    const { calc } = calcOf({ x: [0, null, 1, 1, NaN], y: [0, 0, null, 1, 1], ...UNIT });
    expectCells(calc.z, [1, 0, 0, 1]);
    expect(calc.binned).toBe(2);
    expect(Array.from(calc.cellStart)).toEqual([0, 1, 1, 1, 2]);
    expect(Array.from(calc.cellPoints)).toEqual([0, 3]);
  });
});
