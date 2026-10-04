/**
 * `histogram2d` calc: the bin grid at its limits (bins that hold no sample, bins that end before
 * they start, more cells than can be drawn) and on log axes.
 *
 * Expected values are worked out by hand from explicit bins: edges are `start + k·size` while
 * below `end` (Plotly's histogram calc loop), log axes are binned in data units and drawn at
 * log10 of the edges (`xbins.start` / `end` are exponents there, as in Plotly).
 */
import {
  createScale,
  supplyDefaults,
  type AxisType,
  type FullAxis,
  type FullLayout,
} from '@mk7s/holochart-core';
import { createChartRegistry, type AxisInfo, type CalcContext } from '@mk7s/holochart-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { histogram2dcontour } from '../histogram2dcontour/index.ts';
import { MAX_CELLS } from './calc.ts';
import { recordedZExtent } from './colorscale.ts';
import { histogram2d } from './index.ts';

const registry = createChartRegistry().register(histogram2d, histogram2dcontour);

function axis(fullLayout: FullLayout, id: 'x' | 'y'): AxisInfo {
  const full = fullLayout[`${id}axis`] as FullAxis;
  const type = ((full as { type?: AxisType }).type ?? 'linear') as AxisType;
  const scale = createScale({ type, range: type === 'log' ? [0, 3] : [-5, 5] });
  return { id, name: `${id}axis`, letter: id, type, scale, full } as unknown as AxisInfo;
}

/** Defaults, calc and extremes of one histogram2d trace, through the trace module. */
function calcOf(trace: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'histogram2d', ...trace }], layout },
    registry.core,
  );
  const ctx: CalcContext = {
    fullLayout,
    index: 0,
    xaxis: axis(fullLayout, 'x'),
    yaxis: axis(fullLayout, 'y'),
  };
  const full = fullData[0]!;
  const calc = histogram2d.calc!(full, ctx);
  return { trace: full, fullLayout, calc, extremes: histogram2d.extremes!(calc, full, ctx) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('histogram2d calc: bins without samples', () => {
  // A 2 × 3 grid over [0, 2) × [0, 3); every sample lies outside it.
  const OUTSIDE = {
    x: [10, 11, -4],
    y: [10, 1, 1],
    xbins: { start: 0, end: 2, size: 1 },
    ybins: { start: 0, end: 3, size: 1 },
  };

  it('keeps the grid with zero counts when every sample is outside the bins', () => {
    const { calc, trace, extremes } = calcOf(OUTSIDE);
    expect([calc.nx, calc.ny]).toEqual([2, 3]);
    expect(Array.from(calc.z)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(calc.binned).toBe(0);
    expect(Array.from(calc.cellStart)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(calc.cellPoints).toHaveLength(0);
    expect(calc.zExtent).toEqual([0, 0]);
    expect(recordedZExtent(trace)).toEqual([0, 0]);
    // No sample to round the labels against: hover shows the bin edges as they are.
    expect(Array.from(calc.x.ranges)).toEqual([0, 1, 1, 2]);
    expect(Array.from(calc.y.ranges)).toEqual([0, 1, 1, 2, 2, 3]);
    // The grid still spans its bins for autorange.
    expect([extremes.x!.min[0]!.l, extremes.x!.max[0]!.l]).toEqual([0, 2]);
    expect([extremes.y!.min[0]!.l, extremes.y!.max[0]!.l]).toEqual([0, 3]);
  });

  it.each(['avg', 'min', 'max'] as const)(
    'has no value in any cell, and no value extent, for %s of nothing',
    (histfunc) => {
      const { calc, trace, fullLayout } = calcOf({ ...OUTSIDE, z: [1, 2, 3], histfunc });
      expect(calc.histfunc).toBe(histfunc);
      expect(calc.z).toHaveLength(6);
      for (const v of calc.z) expect(v).toBeNaN();
      expect(calc.zExtent).toEqual([NaN, NaN]);
      // Nothing for the colorbar to show.
      expect(recordedZExtent(trace)).toBeUndefined();
      expect(histogram2d.colorbar!(trace, { fullLayout })).toBeNull();
    },
  );
});

describe('histogram2d calc: grids that cannot be drawn', () => {
  it('is empty, silently, when the bins end before they start', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { calc, trace, extremes } = calcOf({
      x: [1, 2, 3],
      y: [1, 2, 3],
      xbins: { start: 5, end: 4, size: 1 },
      ybins: { start: 0, end: 4, size: 1 },
    });
    expect([calc.nx, calc.ny]).toEqual([0, 0]);
    expect(calc.z).toHaveLength(0);
    expect(calc.x.count).toBe(0);
    expect(calc.x.edges).toHaveLength(0);
    expect(calc.binned).toBe(0);
    expect(calc.zExtent).toEqual([NaN, NaN]);
    expect(Array.from(calc.cellStart)).toEqual([0]);
    expect(recordedZExtent(trace)).toBeUndefined();
    // Nothing to autorange on.
    expect(extremes).toEqual({});
    expect(warn).not.toHaveBeenCalled();
  });

  it('is empty, with a console warning naming the trace and its bins, above MAX_CELLS', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // 5000 bins of 1 per direction: 25 M cells, above the 4096² limit.
    const bins = { start: 0, end: 5000, size: 1 };
    expect(5000 * 5000).toBeGreaterThan(MAX_CELLS);
    const { calc, extremes } = calcOf({ x: [1, 2, 3], y: [1, 2, 3], xbins: bins, ybins: bins });
    expect([calc.nx, calc.ny]).toEqual([0, 0]);
    expect(calc.z).toHaveLength(0);
    expect(extremes).toEqual({});
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]![0]);
    expect(message).toContain('histogram2d trace 0');
    expect(message).toContain('5000×5000');
    expect(message).toContain(String(MAX_CELLS));
  });
});

describe('histogram2d calc: log axes', () => {
  const LOG_Y = { yaxis: { type: 'log' } };
  const XBINS = { xbins: { start: 0, end: 2, size: 1 } };

  it('bins positive data in data units and draws the edges at their log10', () => {
    // ybins from 10^0 = 1 to 10^2 = 100 in steps of 30 data units: 1, 31, 61, 91, 121.
    const { calc, extremes } = calcOf(
      {
        x: [0, 0, 1, 1, 1, 1],
        y: [1, 10, 40, 100, 120.5, 200],
        ...XBINS,
        ybins: { start: 0, end: 2, size: 30 },
      },
      LOG_Y,
    );
    expect(calc.y.type).toBe('log');
    expect(Array.from(calc.y.calcEdges)).toEqual([1, 31, 61, 91, 121]);
    const edges = [1, 31, 61, 91, 121].map((v) => Math.log10(v));
    expect(Array.from(calc.y.edges)).toEqual(edges);
    expect(Array.from(calc.y.centers)).toEqual(
      [0, 1, 2, 3].map((j) => (edges[j]! + edges[j + 1]!) / 2),
    );
    // Rows are y bins: [1, 31) ← (0, 1), (0, 10); [31, 61) ← (1, 40); [91, 121) ← (1, 100),
    // (1, 120.5); 200 is past the last bin.
    expect([calc.nx, calc.ny]).toEqual([2, 4]);
    expect(Array.from(calc.z)).toEqual([2, 0, 0, 1, 0, 0, 0, 2]);
    expect(calc.binned).toBe(5);
    // Autorange spans the grid in axis (log10) coordinates.
    expect([extremes.y!.min[0]!.l, extremes.y!.max[0]!.l]).toEqual([0, Math.log10(121)]);
  });

  it('extrapolates an edge at or below zero one bin below the first positive edge', () => {
    // Integers in bins of 10: Plotly's automatic start is half a unit below a multiple of 10, so
    // the edges are -0.5, 9.5, 19.5, 29.5; -0.5 has no logarithm.
    const { calc } = calcOf(
      { x: [0, 0, 1, 1], y: [1, 2, 12, 25], ...XBINS, ybins: { size: 10 } },
      LOG_Y,
    );
    expect(Array.from(calc.y.calcEdges)).toEqual([-0.5, 9.5, 19.5, 29.5]);
    const positive = [9.5, 19.5, 29.5].map((v) => Math.log10(v));
    const below = positive[0]! - (positive[1]! - positive[0]!);
    expect(calc.y.edges[0]).toBeCloseTo(below, 12);
    expect(Array.from(calc.y.edges.subarray(1))).toEqual(positive);
    expect(calc.y.centers[0]).toBeCloseTo((below + positive[0]!) / 2, 12);
    // Samples are binned in data units: [-0.5, 9.5) ← 1, 2; [9.5, 19.5) ← 12; [19.5, 29.5) ← 25.
    expect(Array.from(calc.z)).toEqual([2, 0, 0, 1, 0, 1]);
  });

  it('keeps a lone bin that starts at or below zero drawable', () => {
    // Integers 1…4 in one bin of 5: edges -0.5 and 4.5.
    const { calc, extremes } = calcOf(
      { x: [0, 0, 1, 1], y: [1, 2, 3, 4], ...XBINS, ybins: { size: 5 } },
      LOG_Y,
    );
    expect(Array.from(calc.y.calcEdges)).toEqual([-0.5, 4.5]);
    expect([calc.nx, calc.ny]).toEqual([2, 1]);
    expect(Array.from(calc.z)).toEqual([2, 2]);
    const [lo, hi] = Array.from(calc.y.edges);
    expect(hi).toBe(Math.log10(4.5));
    expect(Number.isFinite(lo)).toBe(true);
    expect(lo!).toBeLessThan(hi!);
    expect(calc.y.centers[0]).toBeCloseTo((lo! + hi!) / 2, 12);
    expect(extremes.y!.max[0]!.l).toBe(Math.log10(4.5));
    expect(extremes.y!.min[0]!.l).toBe(lo);
  });
});
