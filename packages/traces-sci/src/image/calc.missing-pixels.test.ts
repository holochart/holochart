/**
 * Missing rows and pixels of an image `z` (plotly.js `image/calc.js`: the height is `z.length`, the
 * width the longest row; `image/hover.js`: no hover label without a pixel): they keep their place in
 * the grid, are drawn transparent and are not hovered.
 */
import { createScale, supplyDefaults, type FullAxis, type FullLayout } from '@mk7s/holochart-core';
import { IDENTITY_TRANSFORM } from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type AxisInfo,
  type HoverContext,
  type HoverQuery,
} from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { calcImage, pixelAt } from './calc.ts';
import { image } from './index.ts';

const registry = createChartRegistry().register(image);

function axis(fullLayout: FullLayout, id: 'x' | 'y'): AxisInfo {
  const full = fullLayout[`${id}axis`] as FullAxis;
  const scale = createScale({ type: 'linear', range: [-5, 5] });
  return { id, name: `${id}axis`, letter: id, type: 'linear', scale, full } as unknown as AxisInfo;
}

function calcOf(trace: Record<string, unknown>) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'image', ...trace }] },
    registry.core,
  );
  const xaxis = axis(fullLayout, 'x');
  const yaxis = axis(fullLayout, 'y');
  const t = fullData[0]!;
  return { trace: t, fullLayout, xaxis, yaxis, calc: calcImage(t, { xaxis, yaxis }) };
}

/** The hover points at pixel column `i`, row `j` (pixel centers sit on the integers). */
function hover(s: ReturnType<typeof calcOf>, i: number, j: number) {
  const ctx: HoverContext = {
    fullLayout: s.fullLayout,
    xaxis: s.xaxis,
    yaxis: s.yaxis,
    transform: IDENTITY_TRANSFORM,
  };
  const query: HoverQuery = { px: 0, py: 0, xl: i, yl: j, mode: 'closest', distance: 20 };
  return image.hoverPoints!(s.calc, s.trace, query, ctx);
}

/**
 * 3 columns × 3 rows: red, a missing pixel, green; a missing row; then a row with only a blue
 * pixel.
 */
const Z = [[[255, 0, 0], null, [0, 255, 0]], null, [[0, 0, 255]]];

describe('image calc with missing rows and pixels', () => {
  it('counts a missing row in the height and takes the width from the longest row', () => {
    const { calc } = calcOf({ z: Z });
    expect([calc.w, calc.h]).toEqual([3, 3]);
    expect(calc.xEdges).toEqual([-0.5, 2.5]);
    expect(calc.yEdges).toEqual([-0.5, 2.5]);
  });

  it('draws them transparent and the pixels around them where they are', () => {
    const { calc } = calcOf({ z: Z });
    const none = [0, 0, 0, 0];
    expect(Array.from(calc.pixels!.data)).toEqual([
      ...[255, 0, 0, 255],
      ...none,
      ...[0, 255, 0, 255],
      // The missing row.
      ...none,
      ...none,
      ...none,
      // The short row: only its first pixel.
      ...[0, 0, 255, 255],
      ...none,
      ...none,
    ]);
  });

  it('hovers the pixels that exist and nothing on missing ones', () => {
    const s = calcOf({ z: Z });
    expect(hover(s, 2, 0).map((p) => [p.cell, p.labels!['z']])).toEqual([[[0, 2], '[0, 255, 0]']]);
    expect(hover(s, 0, 2).map((p) => [p.cell, p.labels!['z']])).toEqual([[[2, 0], '[0, 0, 255]']]);
    // A missing pixel, the missing row, and past the end of the short row.
    expect(hover(s, 1, 0)).toEqual([]);
    expect(hover(s, 0, 1)).toEqual([]);
    expect(hover(s, 2, 1)).toEqual([]);
    expect(hover(s, 1, 2)).toEqual([]);
    expect(hover(s, 2, 2)).toEqual([]);
  });

  it('looks pixels up as z[row][column]', () => {
    expect(pixelAt(Z, 0, 2)).toEqual([0, 255, 0]);
    expect(pixelAt(Z, 2, 0)).toEqual([0, 0, 255]);
    expect(pixelAt(Z, 0, 1)).toBeUndefined();
    expect(pixelAt(Z, 1, 0)).toBeUndefined();
    expect(pixelAt(Z, 2, 2)).toBeUndefined();
  });
});
