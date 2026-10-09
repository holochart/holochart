/**
 * `histogram2dcontour` calc: the grid that is contoured (cell values, bin centers, the empty
 * bins padded around automatic bins) and grids too small to contour.
 *
 * Expected values are worked out by hand from explicit bins, or compared with the `histogram2d`
 * calc of the same samples. The padding follows plotly.js' `calcAllAutoBins`: with a
 * `histogram2dcontour` in the bin group, the start moves one bin down unless `size` is set, and
 * the end one bin up unless `end` is set.
 */
import { createScale, supplyDefaults, type FullAxis, type FullLayout } from '@mk7s/holochart-core';
import { createChartRegistry, type AxisInfo, type CalcContext } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { recordedZExtent } from '../histogram2d/colorscale.ts';
import { histogram2d } from '../histogram2d/index.ts';
import { histogram2dcontour } from './index.ts';

const registry = createChartRegistry().register(histogram2d, histogram2dcontour);

function axis(fullLayout: FullLayout, id: 'x' | 'y'): AxisInfo {
  const scale = createScale({ type: 'linear', range: [-5, 5], length: 400 });
  const full = { ...(fullLayout[`${id}axis`] as FullAxis), type: 'linear' } as FullAxis;
  return { id, name: `${id}axis`, letter: id, type: 'linear', scale, full } as unknown as AxisInfo;
}

/** Defaults and calc of one trace of `type`, through its trace module. */
function setup<T extends 'histogram2d' | 'histogram2dcontour'>(
  type: T,
  trace: Record<string, unknown>,
) {
  const { fullData, fullLayout } = supplyDefaults({ data: [{ type, ...trace }] }, registry.core);
  const ctx: CalcContext = {
    fullLayout,
    index: 0,
    xaxis: axis(fullLayout, 'x'),
    yaxis: axis(fullLayout, 'y'),
  };
  return { trace: fullData[0]!, fullLayout, ctx };
}

function contourOf(trace: Record<string, unknown>) {
  const s = setup('histogram2dcontour', trace);
  const calc = histogram2dcontour.calc!(s.trace, s.ctx);
  return { ...s, calc, extremes: histogram2dcontour.extremes!(calc, s.trace, s.ctx) };
}

function heatmapOf(trace: Record<string, unknown>) {
  const s = setup('histogram2d', trace);
  return { ...s, calc: histogram2d.calc!(s.trace, s.ctx) };
}

function expectClose(actual: ArrayLike<number>, expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((v, k) => expect(actual[k]).toBeCloseTo(v, 12));
}

describe('histogram2dcontour calc: the contoured grid', () => {
  it('bins like histogram2d and contours the grid at the bin centers', () => {
    // Explicit bins: 3 × 2 cells of 1 × 1 over [0, 3) × [0, 2).
    // Row y ∈ [0, 1): two samples at x 0.5, one at 2.5; row y ∈ [1, 2): one at x 1.5.
    const { calc, trace, extremes } = contourOf({
      x: [0.5, 0.5, 1.5, 2.5],
      y: [0.5, 0.5, 1.5, 0.5],
      xbins: { start: 0, end: 3, size: 1 },
      ybins: { start: 0, end: 2, size: 1 },
    });
    expect([calc.nx, calc.ny]).toEqual([3, 2]);
    expect(Array.from(calc.x.edges)).toEqual([0, 1, 2, 3]);
    expect(Array.from(calc.y.edges)).toEqual([0, 1, 2]);
    expect(Array.from(calc.z)).toEqual([2, 0, 1, 0, 1, 0]);
    expect(calc.binned).toBe(4);
    expect(calc.zExtent).toEqual([0, 2]);
    expect(recordedZExtent(trace)).toEqual([0, 2]);
    // Counts have no gaps to fill: the contoured values are the counts.
    expect(Array.from(calc.zFilled)).toEqual([2, 0, 1, 0, 1, 0]);
    // Contours (and autorange) span the first to the last bin center, not the bin edges.
    expect(calc.bounds).toEqual({ x0: 0.5, x1: 2.5, y0: 0.5, y1: 1.5 });
    expect([extremes.x!.min[0]!.l, extremes.x!.max[0]!.l]).toEqual([0.5, 2.5]);
    expect([extremes.y!.min[0]!.l, extremes.y!.max[0]!.l]).toEqual([0.5, 1.5]);
  });

  it('pads automatic bins with one empty bin on every side of the histogram2d grid', () => {
    const data = { x: [1, 2, 2, 3, 3, 3, 4, 4, 5], y: [2, 4, 4, 6, 6, 6, 8, 8, 10] };
    const ref = heatmapOf(data).calc;
    expect(ref.binned).toBe(9);
    const { calc } = contourOf(data);
    expect([calc.nx, calc.ny]).toEqual([ref.nx + 2, ref.ny + 2]);
    for (const dir of ['x', 'y'] as const) {
      const e = ref[dir].edges;
      const w = e[1]! - e[0]!;
      expectClose(calc[dir].edges, [e[0]! - w, ...e, e[e.length - 1]! + w]);
    }
    // The inner cells are the histogram2d counts; the border cells are empty.
    for (let j = 0; j < calc.ny; j++) {
      for (let i = 0; i < calc.nx; i++) {
        const border = i === 0 || j === 0 || i === calc.nx - 1 || j === calc.ny - 1;
        const want = border ? 0 : ref.z[(j - 1) * ref.nx + (i - 1)];
        expect(calc.z[j * calc.nx + i]).toBe(want);
      }
    }
    expect(calc.binned).toBe(9);
  });

  it('pads only the end when the bin size is set, and nothing when the end is set too', () => {
    // Integers in bins of 1 start half a unit below the minimum: histogram2d bins x over
    // [0.5, 3.5) and y over [9.5, 12.5).
    const data = { x: [1, 2, 2, 3], y: [10, 11, 11, 12] };
    const sized = contourOf({ ...data, xbins: { size: 1 }, ybins: { size: 1 } }).calc;
    expect(Array.from(sized.x.edges)).toEqual([0.5, 1.5, 2.5, 3.5, 4.5]);
    expect(Array.from(sized.y.edges)).toEqual([9.5, 10.5, 11.5, 12.5, 13.5]);
    // Samples sit on the diagonal (1, 10), (2, 11) twice, (3, 12); the last row and column are
    // the padding.
    expect(Array.from(sized.z)).toEqual([1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]);

    const bounded = contourOf({
      ...data,
      xbins: { start: 0.5, end: 3.5, size: 1 },
      ybins: { start: 9.5, end: 12.5, size: 1 },
    }).calc;
    expect(Array.from(bounded.x.edges)).toEqual([0.5, 1.5, 2.5, 3.5]);
    expect(Array.from(bounded.y.edges)).toEqual([9.5, 10.5, 11.5, 12.5]);
    expect(Array.from(bounded.z)).toEqual([1, 0, 0, 0, 2, 0, 0, 0, 1]);
  });
});

describe('histogram2dcontour calc: grids too small to contour', () => {
  const SAMPLES = { x: [1, 2, 3], y: [1, 2, 3] };
  const ONE_BIN = { start: 0, end: 5, size: 10 };
  const FOUR_BINS = { start: 0, end: 4, size: 1 };

  it.each([
    ['x', { xbins: ONE_BIN, ybins: FOUR_BINS }, [1, 4]],
    ['y', { xbins: FOUR_BINS, ybins: ONE_BIN }, [4, 1]],
  ] as const)('contours nothing with a single bin along %s', (_dir, bins, grid) => {
    // histogram2d draws that grid: it is the contouring that needs two centers per direction.
    const ref = heatmapOf({ ...SAMPLES, ...bins }).calc;
    expect([ref.nx, ref.ny]).toEqual(grid);
    expect(ref.binned).toBe(3);

    const { calc, trace, fullLayout, extremes } = contourOf({ ...SAMPLES, ...bins });
    expect([calc.nx, calc.ny]).toEqual([0, 0]);
    expect(calc.z).toHaveLength(0);
    expect(calc.zFilled).toHaveLength(0);
    expect(calc.binned).toBe(0);
    expect(calc.zExtent).toEqual([NaN, NaN]);
    expect(calc.levels.levels).toEqual([]);
    expect(calc.paths).toEqual([]);
    expect(calc.regions).toBeUndefined();
    // No extent for the colorbar, nothing to autorange on.
    expect(recordedZExtent(trace)).toBeUndefined();
    expect(histogram2dcontour.colorbar!(trace, { fullLayout })).toBeNull();
    expect(extremes).toEqual({});
  });
});
