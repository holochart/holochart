import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  aggregateCategoryValues,
  collectCategoryValues,
  sortCategoriesByValue,
  valueCategoryOrder,
} from './category-values.ts';

describe('valueCategoryOrder', () => {
  it('parses the value-based orders only', () => {
    expect(valueCategoryOrder('total descending')).toEqual({
      aggregate: 'total',
      descending: true,
    });
    expect(valueCategoryOrder('median ascending')).toEqual({
      aggregate: 'median',
      descending: false,
    });
    for (const o of [
      undefined,
      'trace',
      'array',
      'category ascending',
      'total',
      'total up',
      'geometric mean ascending',
    ]) {
      expect(valueCategoryOrder(o)).toBeUndefined();
    }
  });
});

describe('collectCategoryValues', () => {
  it('buckets samples by category index across traces, skipping invalid points', () => {
    const values = collectCategoryValues(
      ['a', 'b', 'c'],
      [
        { index: [0, 1, 2, NaN, -1, 3, 0.5], value: [1, 2, 3, 4, 5, 6, 7] },
        { index: Float64Array.from([2, 0, 1]), value: Float64Array.from([10, NaN, Infinity]) },
        // Extra indices without a value are ignored.
        { index: [1, 1], value: [20] },
      ],
    );
    expect([...values]).toEqual([
      ['a', [1]],
      ['b', [2, 20]],
      ['c', [3, 10]],
    ]);
  });

  it('lists every category, including ones without values', () => {
    expect(collectCategoryValues(['a', 'b'], [])).toEqual(
      new Map([
        ['a', []],
        ['b', []],
      ]),
    );
  });
});

describe('aggregateCategoryValues', () => {
  const v = [4, NaN, 1, 10, 2];

  it('aggregates the finite values', () => {
    expect(aggregateCategoryValues('total', v)).toBe(17);
    expect(aggregateCategoryValues('sum', v)).toBe(17);
    expect(aggregateCategoryValues('min', v)).toBe(1);
    expect(aggregateCategoryValues('max', v)).toBe(10);
    expect(aggregateCategoryValues('mean', v)).toBe(17 / 4);
    expect(aggregateCategoryValues('median', v)).toBe(3);
  });

  it('takes a numeric median (not Plotly’s string sort)', () => {
    // Plotly's `Lib.median` sorts [10, 9, 2] as strings → [10, 2, 9] → 2.
    expect(aggregateCategoryValues('median', [10, 9, 2])).toBe(9);
    expect(aggregateCategoryValues('median', [-1, -10])).toBe(-5.5);
  });

  it('sums to 0 without values; the other aggregates are NaN', () => {
    for (const empty of [undefined, [], [NaN, -Infinity]]) {
      expect(aggregateCategoryValues('total', empty)).toBe(0);
      expect(aggregateCategoryValues('sum', empty)).toBe(0);
      expect(aggregateCategoryValues('min', empty)).toBeNaN();
      expect(aggregateCategoryValues('max', empty)).toBeNaN();
      expect(aggregateCategoryValues('mean', empty)).toBeNaN();
      expect(aggregateCategoryValues('median', empty)).toBeNaN();
    }
  });
});

describe('sortCategoriesByValue', () => {
  const cats = ['a', 'b', 'c', 'd', 'e'];
  const values = new Map<string, number[]>([
    ['a', [3, 3]],
    ['b', [1, 2, 9]],
    ['c', [5, -1]],
    ['d', [NaN]],
  ]);
  const sort = (order: string) => sortCategoriesByValue(cats, order, values);

  it('total / sum: categories without values count as 0', () => {
    // a 6, b 12, c 4, d 0, e 0
    expect(sort('total ascending')).toEqual(['d', 'e', 'c', 'a', 'b']);
    expect(sort('total descending')).toEqual(['b', 'a', 'c', 'd', 'e']);
    expect(sort('sum ascending')).toEqual(sort('total ascending'));
    expect(sort('sum descending')).toEqual(sort('total descending'));
  });

  it('min / max / mean / median: categories without values go last, in trace order', () => {
    // min: a 3, b 1, c -1
    expect(sort('min ascending')).toEqual(['c', 'b', 'a', 'd', 'e']);
    expect(sort('min descending')).toEqual(['a', 'b', 'c', 'd', 'e']);
    // max: a 3, b 9, c 5
    expect(sort('max ascending')).toEqual(['a', 'c', 'b', 'd', 'e']);
    expect(sort('max descending')).toEqual(['b', 'c', 'a', 'd', 'e']);
    // mean: a 3, b 4, c 2
    expect(sort('mean ascending')).toEqual(['c', 'a', 'b', 'd', 'e']);
    expect(sort('mean descending')).toEqual(['b', 'a', 'c', 'd', 'e']);
    // median: a 3, b 2, c 2
    expect(sort('median ascending')).toEqual(['b', 'c', 'a', 'd', 'e']);
    expect(sort('median descending')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('keeps ties in trace order in both directions (stable, like Plotly’s comparator)', () => {
    const tied = new Map([
      ['p', [1]],
      ['q', [2]],
      ['r', [1]],
      ['s', [2]],
    ]);
    const list = ['p', 'q', 'r', 's'];
    expect(sortCategoriesByValue(list, 'total ascending', tied)).toEqual(['p', 'r', 'q', 's']);
    expect(sortCategoriesByValue(list, 'total descending', tied)).toEqual(['q', 's', 'p', 'r']);
  });

  it('orders infinite sums without NaN comparisons', () => {
    const big = new Map([
      ['a', [Number.MAX_VALUE, Number.MAX_VALUE]],
      ['b', [1]],
      ['c', [-Number.MAX_VALUE, -Number.MAX_VALUE]],
    ]);
    expect(sortCategoriesByValue(['a', 'b', 'c'], 'total ascending', big)).toEqual(['c', 'b', 'a']);
  });

  it('returns other orders (and missing values) unchanged', () => {
    expect(sortCategoriesByValue(cats, 'trace', values)).toEqual(cats);
    expect(sortCategoriesByValue(cats, 'category descending', values)).toEqual(cats);
    expect(sortCategoriesByValue(cats, 'total descending', undefined)).toEqual(cats);
    expect(sortCategoriesByValue(cats, 'max descending', undefined)).toEqual(cats);
  });

  it('always returns a permutation (property)', () => {
    const order = fc.constantFrom(
      'total ascending',
      'total descending',
      'min ascending',
      'max descending',
      'mean ascending',
      'median descending',
    );
    fc.assert(
      fc.property(fc.uniqueArray(fc.string()), fc.array(fc.double()), order, (list, nums, o) => {
        const vals = new Map(list.map((c, i) => [c, nums.slice(i, i + 2)] as const));
        const sorted = sortCategoriesByValue(list, o, vals);
        expect([...sorted].sort()).toEqual([...list].sort());
      }),
    );
  });
});
