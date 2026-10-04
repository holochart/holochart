/**
 * Autorange of a contour trace (plotly.js `heatmap/calc.js` for contours: `findExtremes` over the
 * first and last grid point, no padding), and the grids that cannot be contoured: they give an empty
 * calc (no levels, no paths) that contributes nothing to autorange and has no colorbar.
 */
import { createScale, supplyDefaults, type FullAxis, type FullLayout } from '@mk7s/holochart-core';
import { createChartRegistry, type AxisInfo, type CalcContext } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { contour } from './index.ts';

const registry = createChartRegistry().register(contour);

function axis(fullLayout: FullLayout, id: 'x' | 'y'): AxisInfo {
  const scale = createScale({ type: 'linear', range: [-5, 5], length: 400 });
  const full = { ...(fullLayout[`${id}axis`] as FullAxis), type: 'linear' } as FullAxis;
  return { id, name: `${id}axis`, letter: id, type: 'linear', scale, full } as unknown as AxisInfo;
}

function setup(trace: Record<string, unknown>) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'contour', ...trace }] },
    registry.core,
  );
  const ctx: CalcContext = {
    fullLayout,
    index: 0,
    xaxis: axis(fullLayout, 'x'),
    yaxis: axis(fullLayout, 'y'),
  };
  const t = fullData[0]!;
  const calc = contour.calc!(t, ctx);
  return {
    trace: t,
    fullLayout,
    calc,
    extremes: contour.extremes!(calc, t, ctx),
    colorbar: contour.colorbar!(t, { fullLayout } as never),
  };
}

describe('contour autorange', () => {
  it('spans the grid points, first to last, without padding', () => {
    // z = x + y on an uneven 4 × 3 grid.
    const xs = [10, 11, 13, 20];
    const ys = [-4, 0, 8];
    const s = setup({ z: ys.map((y) => xs.map((x) => x + y)), x: xs, y: ys });
    expect(s.calc.bounds).toEqual({ x0: 10, x1: 20, y0: -4, y1: 8 });
    expect(s.extremes).toEqual({
      x: { min: [{ l: 10, padPx: 0 }], max: [{ l: 20, padPx: 0 }] },
      y: { min: [{ l: -4, padPx: 0 }], max: [{ l: 8, padPx: 0 }] },
    });
  });

  it('spans x0 + i·dx for a grid without coordinates', () => {
    const s = setup({
      z: [
        [1, 2, 3],
        [4, 5, 6],
      ],
      x0: 5,
      dx: 2,
      y0: -1,
      dy: 0.5,
    });
    // Columns at 5, 7, 9; rows at −1, −0.5.
    expect(s.extremes).toEqual({
      x: { min: [{ l: 5, padPx: 0 }], max: [{ l: 9, padPx: 0 }] },
      y: { min: [{ l: -1, padPx: 0 }], max: [{ l: -0.5, padPx: 0 }] },
    });
  });
});

describe('contour grids that cannot be contoured', () => {
  function expectEmpty(s: ReturnType<typeof setup>): void {
    expect([s.calc.nx, s.calc.ny]).toEqual([0, 0]);
    expect(s.calc.z).toHaveLength(0);
    expect(s.calc.levels.levels).toEqual([]);
    expect(s.calc.paths).toEqual([]);
    expect(s.calc.regions).toBeUndefined();
    // Nothing for autorange, and no color domain to show a colorbar for.
    expect(s.extremes).toEqual({});
    expect(s.colorbar).toBeNull();
  }

  it('draws nothing for a single row or a single column (as Plotly)', () => {
    const row = setup({ z: [[1, 2, 3]] });
    expect(row.trace.visible).toBe(true);
    expectEmpty(row);
    const column = setup({ z: [[1], [2], [3]] });
    expect(column.trace.visible).toBe(true);
    expectEmpty(column);
  });

  it('draws nothing for column data without a numeric z', () => {
    // A 2 × 2 grid of points, none with a value: nothing to fill the gaps from.
    const s = setup({ z: [null, 'a', undefined, NaN], x: [0, 1, 0, 1], y: [0, 0, 1, 1] });
    expect(s.trace.visible).toBe(true);
    expectEmpty(s);
    // One value is enough: the gaps are filled from it (a flat field).
    const one = setup({ z: [null, 'a', 4, NaN], x: [0, 1, 0, 1], y: [0, 0, 1, 1] });
    expect([one.calc.nx, one.calc.ny]).toEqual([2, 2]);
    expect(Array.from(one.calc.zFilled)).toEqual([4, 4, 4, 4]);
    expect(one.calc.zExtent).toEqual([4, 4]);
    expect(one.extremes).toEqual({
      x: { min: [{ l: 0, padPx: 0 }], max: [{ l: 1, padPx: 0 }] },
      y: { min: [{ l: 0, padPx: 0 }], max: [{ l: 1, padPx: 0 }] },
    });
  });
});
