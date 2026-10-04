/**
 * parcoords calc: the numeric line colors and the order the lines are drawn in.
 *
 * Expected orders are worked out by hand from the documented rule (`ParcoordsCalc.order`): by
 * ascending color value, so higher values are drawn on top (Plotly's depth test); lines without a
 * color value first; ties in data order. A plain `line.color` keeps the data order.
 */
import { supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import { createChartRegistry } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { calcParcoords } from './calc.ts';
import { parcoords } from './index.ts';

const registry = createChartRegistry().register(parcoords);

/** Calc of a defaulted trace of one dimension with `lines` lines and `line.color: color`. */
function calcOf(lines: number, color?: unknown) {
  const { fullData } = supplyDefaults(
    {
      data: [
        {
          type: 'parcoords',
          dimensions: [{ values: Array.from({ length: lines }, (_, i) => i) }],
          ...(color === undefined ? {} : { line: { color } }),
        },
      ],
      layout: {},
    },
    registry.core,
  );
  return calcParcoords(fullData[0] as FullTrace);
}

describe('parcoords calc: line draw order', () => {
  it('keeps the data order among lines of the same color value', () => {
    const calc = calcOf(5, [2, 1, 2, 1, 0]);
    // 0 (line 4), then the 1s (lines 1, 3), then the 2s (lines 0, 2).
    expect(Array.from(calc.order)).toEqual([4, 1, 3, 0, 2]);
    expect(calc.colorExtent).toEqual([0, 2]);
  });

  it('draws every line without a color value first, in data order', () => {
    const calc = calcOf(6, [3, NaN, 1, null, 2, 'red']);
    // Not numbers: lines 1, 3, 5. Then 1 (line 2), 2 (line 4), 3 (line 0).
    expect(Array.from(calc.order)).toEqual([1, 3, 5, 2, 4, 0]);
    expect(Array.from(calc.colors!)).toEqual([3, NaN, 1, NaN, 2, NaN]);
    // The color domain ignores them.
    expect(calc.colorExtent).toEqual([1, 3]);
  });

  it('reads numeric strings among the colors as numbers', () => {
    const calc = calcOf(3, [3, '1', ' 2 ']);
    expect(Array.from(calc.colors!)).toEqual([3, 1, 2]);
    expect(Array.from(calc.order)).toEqual([1, 2, 0]);
    expect(calc.colorExtent).toEqual([1, 3]);
  });

  it('leaves the colors past the last line out of the order and the color domain', () => {
    // Two lines (the dimension has two values), four colors.
    const calc = calcOf(2, [5, 1, 9, 0]);
    expect(calc.length).toBe(2);
    expect(Array.from(calc.colors!)).toEqual([5, 1]);
    expect(Array.from(calc.order)).toEqual([1, 0]);
    expect(calc.colorExtent).toEqual([1, 5]);
  });

  it('draws lines of one plain color in data order, with no color values', () => {
    for (const color of [undefined, 'teal', ['red', 'blue', 'green', 'black']]) {
      const calc = calcOf(4, color);
      expect(calc.colors).toBeUndefined();
      expect(Array.from(calc.order)).toEqual([0, 1, 2, 3]);
      expect(calc.colorExtent).toEqual([NaN, NaN]);
    }
  });
});
