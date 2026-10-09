/**
 * parcats calc: the weight (`counts`) of each sample in the category and path counts.
 *
 * Expected counts are summed by hand from the documented rule: `counts` is the weight of each
 * sample, one for all or one per sample (arrays repeat), a number ≥ 0, 1 by default; a sample
 * whose count is not a positive number weighs nothing but stays in its category and path.
 */
import { supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import { createChartRegistry } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { parcats } from './index.ts';

const registry = createChartRegistry().register(parcats);

/** 2 dimensions, 4 samples: A = x x y y, B = p q p p (categories in order of appearance). */
function calcOf(counts: unknown) {
  const { fullData, fullLayout } = supplyDefaults(
    {
      data: [
        {
          type: 'parcats',
          dimensions: [
            { label: 'A', values: ['x', 'x', 'y', 'y'] },
            { label: 'B', values: ['p', 'q', 'p', 'p'] },
          ],
          counts,
        },
      ],
      layout: {},
    },
    registry.core,
  );
  const trace = fullData[0] as FullTrace;
  const calc = parcats.calc!(trace, { fullLayout, index: 0, xaxis: undefined, yaxis: undefined });
  return {
    total: calc.total,
    /** `[value, count]` of every category, per dimension. */
    categories: calc.dimensions.map((d) => d.categories.map((c) => [c.value, c.count])),
    /** `[categories, count, samples]` of every path (`xp`: A = x and B = p). */
    paths: calc.paths.map((p) => [
      p.categories.map((c, d) => calc.dimensions[d]!.categories[c]!.value).join(''),
      p.count,
      p.valueInds,
    ]),
  };
}

describe('parcats calc: sample weights', () => {
  it('weighs every sample by one number', () => {
    expect(calcOf(2.5)).toEqual({
      total: 10,
      categories: [
        [
          ['x', 5],
          ['y', 5],
        ],
        [
          ['p', 7.5],
          ['q', 2.5],
        ],
      ],
      paths: [
        ['xp', 2.5, [0]],
        ['xq', 2.5, [1]],
        ['yp', 5, [2, 3]],
      ],
    });
  });

  it('weighs every sample 1 with an empty counts array', () => {
    expect(calcOf([])).toEqual({
      total: 4,
      categories: [
        [
          ['x', 2],
          ['y', 2],
        ],
        [
          ['p', 3],
          ['q', 1],
        ],
      ],
      paths: [
        ['xp', 1, [0]],
        ['xq', 1, [1]],
        ['yp', 2, [2, 3]],
      ],
    });
  });

  it('reads numeric strings in a counts array as numbers', () => {
    // Repeated over the 4 samples: 2 3 2 3.
    expect(calcOf(['2', 3])).toEqual({
      total: 10,
      categories: [
        [
          ['x', 5],
          ['y', 5],
        ],
        [
          ['p', 7],
          ['q', 3],
        ],
      ],
      paths: [
        ['xp', 2, [0]],
        ['xq', 3, [1]],
        ['yp', 5, [2, 3]],
      ],
    });
  });

  it('gives samples with a negative, missing or non-numeric count no weight', () => {
    // Only sample 0 counts; the others stay in their categories and paths.
    expect(calcOf([2, -1, null, 'many'])).toEqual({
      total: 2,
      categories: [
        [
          ['x', 2],
          ['y', 0],
        ],
        [
          ['p', 2],
          ['q', 0],
        ],
      ],
      paths: [
        ['xp', 2, [0]],
        ['xq', 0, [1]],
        ['yp', 0, [2, 3]],
      ],
    });
    // NaN and Infinity are not counts either.
    expect(calcOf([NaN, 1, Infinity, 1]).total).toBe(2);
  });
});
