import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  axisCategories,
  collectCategories,
  collectMulticategories,
  compareCategories,
  multicategoryLevels,
  orderCategories,
} from './categories.ts';
import { createScale } from './scale.ts';
import type { Tick } from './types.ts';

describe('collectCategories', () => {
  it('keeps first-appearance order across traces and skips blanks', () => {
    expect(collectCategories([['b', 'a', 'b', null, ''], undefined, ['c', 'a', 1, '1']])).toEqual([
      'b',
      'a',
      'c',
      '1',
    ]);
    expect(collectCategories([new Float64Array([2, 1, 2])])).toEqual(['2', '1']);
  });
});

describe('collectMulticategories', () => {
  it('sorts by group first appearance, then item first appearance (Plotly)', () => {
    const cols = [
      [
        ['2021', '2020', '2021', '2020', null],
        ['Q2', 'Q2', 'Q1', 'Q1', 'Q3'],
      ],
      'not two-level',
      [
        ['2020', '2022'],
        ['Q3', 'Q1'],
      ],
    ];
    expect(collectMulticategories(cols)).toEqual([
      ['2021', 'Q2'],
      ['2021', 'Q1'],
      ['2020', 'Q2'],
      ['2020', 'Q1'],
      ['2020', 'Q3'],
      ['2022', 'Q1'],
    ]);
  });
});

describe('compareCategories', () => {
  it('compares numerically when both are numbers, else as strings', () => {
    expect(compareCategories('10', '9')).toBeGreaterThan(0);
    expect(compareCategories('b', 'a')).toBeGreaterThan(0);
    expect(compareCategories('a', 'a')).toBe(0);
    expect(compareCategories('10', 'a')).toBeLessThan(0);
    expect(compareCategories(' ', '1')).toBeLessThan(0);
  });
});

describe('orderCategories', () => {
  const cats = ['b', 'c', 'a', '10', '9'];

  it('trace keeps the input order', () => {
    expect(orderCategories(cats, 'trace')).toEqual(cats);
  });

  it('category ascending/descending sort by name', () => {
    expect(orderCategories(cats, 'category ascending')).toEqual(['9', '10', 'a', 'b', 'c']);
    expect(orderCategories(cats, 'category descending')).toEqual(['c', 'b', 'a', '10', '9']);
  });

  it('array puts categoryarray first, then the rest in trace order', () => {
    expect(orderCategories(['b', 'c', 'a'], 'array', { categoryarray: ['a', 'z', 'b'] })).toEqual([
      'a',
      'z',
      'b',
      'c',
    ]);
    expect(orderCategories(['b', 'a'], 'array')).toEqual(['b', 'a']);
  });

  it('orders by per-category aggregates, keeping ties in trace order', () => {
    const values = new Map<string, number[]>([
      ['b', [1, 2, 9]],
      ['c', [5]],
      ['a', [3, 3]],
      ['d', [NaN]],
    ]);
    const base = ['b', 'c', 'a', 'd', 'e'];
    const order = (o: Parameters<typeof orderCategories>[1]) =>
      orderCategories(base, o, { values });
    // totals: b 12, c 5, a 6, d 0 (no finite values), e 0 (none)
    expect(order('total ascending')).toEqual(['d', 'e', 'c', 'a', 'b']);
    expect(order('sum descending')).toEqual(['b', 'a', 'c', 'e', 'd']);
    // min: b 1, c 5, a 3; d, e have none → last
    expect(order('min ascending')).toEqual(['b', 'a', 'c', 'd', 'e']);
    expect(order('max descending')).toEqual(['b', 'c', 'a', 'd', 'e']);
    expect(order('mean ascending')).toEqual(['a', 'b', 'c', 'd', 'e']);
    // median: b 2, c 5, a 3
    expect(order('median ascending')).toEqual(['b', 'a', 'c', 'd', 'e']);
    expect(order('median descending')).toEqual(['c', 'a', 'b', 'd', 'e']);
    expect(orderCategories(['x', 'y'], 'total ascending')).toEqual(['x', 'y']);
  });

  it('always returns a permutation for non-array orders (property)', () => {
    const order = fc.constantFrom(
      'trace',
      'category ascending',
      'category descending',
      'total ascending',
      'median descending',
    ) as fc.Arbitrary<Parameters<typeof orderCategories>[1]>;
    fc.assert(
      fc.property(fc.uniqueArray(fc.string()), order, (list, o) => {
        const values = new Map(list.map((c, i) => [c, [i % 3, i]] as const));
        expect([...orderCategories(list, o, { values })].sort()).toEqual([...list].sort());
      }),
    );
  });
});

describe('axisCategories', () => {
  it('returns categories for category axes', () => {
    expect(
      axisCategories({ type: 'category', categoryorder: 'category descending' }, [
        ['a', 'c'],
        'junk',
        ['b'],
      ]),
    ).toEqual({ categories: ['c', 'b', 'a'] });
    expect(
      axisCategories({ type: 'category', categoryorder: 'array', categoryarray: ['z'] }, [['a']]),
    ).toEqual({ categories: ['z', 'a'] });
    const values = new Map([
      ['a', [1]],
      ['b', [2]],
    ]);
    expect(
      axisCategories({ type: 'category', categoryorder: 'sum descending' }, [['a', 'b']], values),
    ).toEqual({
      categories: ['b', 'a'],
    });
    expect(axisCategories({ type: 'category' }, [new Float32Array([3, 1])])).toEqual({
      categories: ['3', '1'],
    });
  });

  it('returns multicategories for multicategory axes', () => {
    const col = [
      ['b', 'a', 'b'],
      ['y', 'x', 'x'],
    ];
    expect(axisCategories({ type: 'multicategory' }, [col])).toEqual({
      multicategories: [
        ['b', 'y'],
        ['b', 'x'],
        ['a', 'x'],
      ],
    });
    expect(
      axisCategories({ type: 'multicategory', categoryorder: 'category ascending' }, [col]),
    ).toEqual({
      multicategories: [
        ['a', 'x'],
        ['b', 'x'],
        ['b', 'y'],
      ],
    });
    expect(
      axisCategories({ type: 'multicategory', categoryorder: 'category descending' }, [col])
        .multicategories?.[0],
    ).toEqual(['b', 'y']);
  });

  it('returns nothing for other axis types', () => {
    expect(axisCategories({ type: 'linear' }, [['a']])).toEqual({});
  });
});

describe('multicategoryLevels', () => {
  const pairs: [string, string][] = [
    ['g1', 'a'],
    ['g1', 'b'],
    ['g1', 'c'],
    ['g2', 'a'],
    ['g2', 'b'],
  ];
  const ticksFor = (ls: number[]): Tick[] =>
    ls.map((l) => ({ l, text: pairs[l]?.[1] ?? '', text2: pairs[l]?.[0] ?? '' }));

  it('places group labels at the median tick and dividers around groups', () => {
    const s = createScale({ type: 'multicategory', multicategories: pairs, range: [-0.5, 4.5] });
    const levels = multicategoryLevels(s, [
      ...ticksFor([0, 1, 2, 3, 4]),
      { l: 0.5, text: '', minor: true },
    ]);
    expect(levels.groups).toEqual([
      { l: 1, text: 'g1' },
      { l: 3.5, text: 'g2' },
    ]);
    expect(levels.dividers).toEqual([-0.5, 2.5, 4.5]);
  });

  it('drops dividers outside the visible range and handles reversed axes', () => {
    const s = createScale({ type: 'multicategory', multicategories: pairs, range: [0, 4] });
    expect(multicategoryLevels(s, ticksFor([0, 1, 2, 3, 4])).dividers).toEqual([2.5]);
    const r = createScale({ type: 'multicategory', multicategories: pairs, range: [4.5, -0.5] });
    expect(multicategoryLevels(r, ticksFor([4, 3, 2, 1, 0])).dividers).toEqual([4.5, 2.5, -0.5]);
  });

  it('uses the tick step for divider offsets and copes with no ticks', () => {
    const s = createScale({ type: 'multicategory', multicategories: pairs, range: [-0.5, 4.5] });
    // Plotly: a divider half a category before the first tick of each group run.
    expect(multicategoryLevels(s, ticksFor([0, 2, 4])).dividers).toEqual([-0.5, 3.5]);
    expect(multicategoryLevels(s, [])).toEqual({ groups: [], dividers: [] });
    const single = multicategoryLevels(s, [{ l: 0, text: 'a' }]);
    expect(single.groups).toEqual([{ l: 0, text: '' }]);
    expect(single.dividers).toEqual([-0.5, 0.5]);
  });
});
