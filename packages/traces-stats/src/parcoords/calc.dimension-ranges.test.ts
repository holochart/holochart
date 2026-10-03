/**
 * parcoords calc: the axis range of each dimension and the position of every line on it.
 *
 * Expected values are worked out by hand from the documented definitions (`ParcoordsDimension`):
 * the range is `range` as given, else the extent of the values of the lines that are drawn
 * (widened by a tenth of its magnitude when they are all equal); a line sits at
 * `(v − bottom) / (top − bottom)`, NaN when its value is not a number.
 */
import { supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import { createChartRegistry } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { calcParcoords } from './calc.ts';
import { parcoords } from './index.ts';

const registry = createChartRegistry().register(parcoords);

function calcOf(trace: Record<string, unknown>) {
  const { fullData } = supplyDefaults(
    { data: [{ type: 'parcoords', ...trace }], layout: {} },
    registry.core,
  );
  const full = fullData[0] as FullTrace;
  return { trace: full, calc: calcParcoords(full) };
}

describe('parcoords calc: dimension ranges and line positions', () => {
  it('places numeric strings like numbers and leaves other values off the axis', () => {
    const { calc } = calcOf({
      dimensions: [{ values: [0, '5', ' 2.5 ', '', 'abc', null, 10], range: [0, 10] }],
    });
    expect(calc.length).toBe(7);
    expect(Array.from(calc.dimensions[0]!.unit)).toEqual([0, 0.5, 0.25, NaN, NaN, NaN, 1]);
  });

  it('places values outside a given range beyond the axis ends', () => {
    const { calc } = calcOf({ dimensions: [{ values: [-5, 0, 20, 40], range: [0, 20] }] });
    expect(calc.dimensions[0]!.range).toEqual([0, 20]);
    expect(Array.from(calc.dimensions[0]!.unit)).toEqual([-0.25, 0, 1, 2]);
  });

  it('takes the extent of the drawn lines only: the values past the shortest dimension are out', () => {
    const { calc } = calcOf({
      dimensions: [{ values: [0, 10, 1000] }, { values: [1, 2] }],
    });
    expect(calc.length).toBe(2);
    expect(calc.dimensions.map((d) => d.range)).toEqual([
      [0, 10],
      [1, 2],
    ]);
    expect(Array.from(calc.dimensions[0]!.unit)).toEqual([0, 1]);
    expect(Array.from(calc.dimensions[1]!.unit)).toEqual([0, 1]);
  });

  it('widens a constant negative dimension around its value, bottom below top', () => {
    const { calc } = calcOf({ dimensions: [{ values: [-2, -2, -2] }] });
    // A tenth of the magnitude on each side: −2 ∓ 0.2; every line in the middle.
    const [bottom, top] = calc.dimensions[0]!.range;
    expect(bottom).toBeCloseTo(-2.2, 12);
    expect(top).toBeCloseTo(-1.8, 12);
    const unit = Array.from(calc.dimensions[0]!.unit);
    expect(unit).toHaveLength(3);
    for (const u of unit) expect(u).toBeCloseTo(0.5, 6);
  });

  it('has no axis and no line when no dimension has values', () => {
    const { trace, calc } = calcOf({ dimensions: [{ label: 'a' }, { label: 'b', values: [] }] });
    // The trace stays visible (it has dimensions), with nothing to draw.
    expect(trace.visible).toBe(true);
    expect(trace['_length']).toBe(0);
    expect(calc.dimensions).toEqual([]);
    expect(calc.length).toBe(0);
    expect(calc.colors).toBeUndefined();
    expect(Array.from(calc.order)).toEqual([]);
  });

  it('keeps the place of each visible dimension in `dimensions`', () => {
    const { calc } = calcOf({
      dimensions: [
        { label: 'a', values: [1, 2] },
        { label: 'hidden', values: [3, 4], visible: false },
        { label: 'empty' },
        { values: [5, 7] },
      ],
    });
    expect(calc.dimensions.map((d) => [d.index, d.label, d.range])).toEqual([
      [0, 'a', [1, 2]],
      [3, '', [5, 7]],
    ]);
  });
});
