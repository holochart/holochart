import { createChartRegistry } from '@mk7s/holochart-runtime';
import { supplyDefaults } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import { bar } from '../bar/index.ts';
import { scatter } from '../scatter/index.ts';
import { headPoints, pointCount } from './data.ts';

const twoLevel = [
  ['A', 'A', 'B', 'B', 'B'],
  ['a1', 'a2', 'b1', 'b2', 'b3'],
];

describe('two-level (multicategory) coordinates', () => {
  it('counts points per row, not rows', () => {
    expect(pointCount(twoLevel)).toBe(5);
    expect(pointCount([1, 2, 3])).toBe(3);
    expect(pointCount(new Float64Array(4))).toBe(4);
    expect(pointCount(7)).toBeUndefined();
  });

  it('cuts every row to the point count', () => {
    expect(headPoints(twoLevel, 2)).toEqual([
      ['A', 'A'],
      ['a1', 'a2'],
    ]);
    expect(Array.from(headPoints(new Float64Array([1, 2, 3]), 2) as Float64Array)).toEqual([1, 2]);
  });

  it('gives scatter and bar the right _length (regression: RangeError in calc)', () => {
    const registry = createChartRegistry().register(scatter, bar);
    const { fullData } = supplyDefaults(
      {
        data: [
          { type: 'scatter', x: twoLevel, y: [1, 2, 3, 4, 5] },
          { type: 'bar', x: twoLevel, y: [5, 4, 3, 2, 1] },
        ],
      },
      registry.core,
    );
    expect(fullData.map((t) => t['_length'])).toEqual([5, 5]);
  });
});
