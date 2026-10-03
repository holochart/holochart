/**
 * The value extent a contour trace's colorscale spans (plotly.js `contour/calc.js`): the data,
 * except for `contours.coloring: 'heatmap'` with manual levels and an automatic color domain, where
 * Plotly spans the levels' bands instead: `[start − size/2, start − size/2 + nc·size]` with
 * `nc = floor((end + size/1e6 − start) / size) + 1` levels. Expected values below are worked out by
 * hand from that definition.
 */
import { createScale, supplyDefaults, type FullAxis, type FullLayout } from '@mk7s/holochart-core';
import { createChartRegistry, type AxisInfo, type CalcContext } from '@mk7s/holochart-runtime';
import { zDomain } from '@mk7s/holochart-traces-stats';
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
  return { trace: t, fullLayout, calc: contour.calc!(t, ctx) };
}

/** A cone: z = 10 − distance from the middle (2, 2) of a 5 × 5 grid. */
function cone(): number[][] {
  const z: number[][] = [];
  for (let j = 0; j < 5; j++) {
    const row: number[] = [];
    for (let i = 0; i < 5; i++) row.push(10 - Math.hypot(i - 2, j - 2));
    z.push(row);
  }
  return z;
}

/** The cone's values: 10 in the middle, 10 − √8 in the corners. */
const DATA = [10 - Math.hypot(2, 2), 10];

/** The color domain in effect after calc (what the colorscale spans). */
function colorDomain(s: ReturnType<typeof setup>): [number, number] {
  return zDomain(s.trace, s.fullLayout);
}

/** The range of the trace's colorbar. */
function colorbarRange(s: ReturnType<typeof setup>): [number, number] {
  const bar = contour.colorbar!(s.trace, { fullLayout: s.fullLayout } as never);
  return [bar!.cmin, bar!.cmax];
}

describe("contour calc: color range of coloring 'heatmap' with manual levels", () => {
  it('spans the bands of the levels: half a band below the first to half a band above the last', () => {
    const s = setup({
      z: cone(),
      contours: { coloring: 'heatmap', start: 7.5, end: 9.5, size: 0.5 },
    });
    expect(s.trace['autocontour']).toBe(false);
    expect(s.calc.levels.levels).toEqual([7.5, 8, 8.5, 9, 9.5]);
    // 5 levels: 5 bands of 0.5 from 7.5 − 0.25.
    expect(colorDomain(s)).toEqual([7.25, 9.75]);
    expect(colorbarRange(s)).toEqual([7.25, 9.75]);
    // The data extent itself is unchanged (automatic levels and hover read it).
    expect(s.calc.zExtent).toEqual(DATA);
  });

  it('counts only the levels at or below contours.end', () => {
    const s = setup({ z: cone(), contours: { coloring: 'heatmap', start: 7, end: 9.4, size: 1 } });
    expect(s.calc.levels.levels).toEqual([7, 8, 9]);
    // 3 levels: 3 bands of 1 from 7 − 0.5.
    expect(colorDomain(s)).toEqual([6.5, 9.5]);
  });

  it('gives a single level without a size a band of 1 (Plotly setContours: start = end)', () => {
    const s = setup({ z: cone(), contours: { coloring: 'heatmap', start: 8, end: 8 } });
    expect(s.trace['autocontour']).toBe(false);
    expect(s.calc.levels).toMatchObject({ start: 8, end: 8, size: 1, levels: [8] });
    expect(colorDomain(s)).toEqual([7.5, 8.5]);
    expect(colorbarRange(s)).toEqual([7.5, 8.5]);
  });
});

describe('contour calc: color range otherwise', () => {
  it("spans the data with automatic levels, also for coloring 'heatmap'", () => {
    const auto = setup({ z: cone(), contours: { coloring: 'heatmap' } });
    expect(auto.trace['autocontour']).toBe(true);
    expect(colorDomain(auto)).toEqual(DATA);
    expect(colorbarRange(auto)).toEqual(DATA);
    // Without both start and end the levels stay automatic (Plotly handleContourDefaults).
    const half = setup({ z: cone(), contours: { coloring: 'heatmap', start: 7.5, size: 0.5 } });
    expect(half.trace['autocontour']).toBe(true);
    expect(colorDomain(half)).toEqual(DATA);
  });

  it("spans the data for manual levels with coloring 'fill' and 'lines'", () => {
    const levels = { start: 7.5, end: 9.5, size: 0.5 };
    const fill = setup({ z: cone(), contours: levels });
    expect(fill.trace['autocontour']).toBe(false);
    expect(colorDomain(fill)).toEqual(DATA);
    const lines = setup({ z: cone(), contours: { ...levels, coloring: 'lines' } });
    expect(colorDomain(lines)).toEqual(DATA);
  });

  it('keeps a given zmin / zmax (no automatic color domain)', () => {
    const s = setup({
      z: cone(),
      zmin: 0,
      zmax: 20,
      contours: { coloring: 'heatmap', start: 7.5, end: 9.5, size: 0.5 },
    });
    expect(s.trace['zauto']).toBe(false);
    expect(colorDomain(s)).toEqual([0, 20]);
    expect(colorbarRange(s)).toEqual([0, 20]);
  });
});
