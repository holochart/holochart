import { describe, expect, it } from 'vitest';
import type {
  GridInsight,
  PricesInsight,
  SharesInsight,
  TraceInsight,
  ValueInsight,
} from '../contracts.ts';
import { summarizeTrace } from './summary.ts';

const plain = (v: number): string => String(v);
const MONTHS = ['Jan', 'Feb', 'Mar'];

const say = (insight: TraceInsight, name: string): string[] =>
  summarizeTrace(insight, name, undefined);

describe('parts of a whole (E17.2)', () => {
  const LABELS = ['Chrome', 'Safari', 'Edge'];
  function parts(values: readonly number[], extra: Partial<SharesInsight> = {}): SharesInsight {
    return {
      kind: 'shares',
      part: 'slice',
      length: values.length,
      values,
      label: (i) => LABELS[i]!,
      formatValue: plain,
      ...extra,
    };
  }

  it('names a single part without a "Next" sentence', () => {
    expect(say(parts([641]), 'Browsers')).toEqual([
      'Chrome is the largest slice of Browsers: 100% (641).',
    ]);
    // Missing values are not parts.
    expect(say(parts([NaN, 187, NaN]), 'Browsers')).toEqual([
      'Safari is the largest slice of Browsers: 100% (187).',
    ]);
  });

  it('keeps equal parts in their own order', () => {
    // 5 / 13 = 38.5 %, 3 / 13 = 23.1 %.
    expect(say(parts([3, 5, 5]), 'Browsers')).toEqual([
      'Safari is the largest slice of Browsers: 38.5% (5).',
      'Next: Edge, 38.5% (5), and Chrome, 23.1% (3).',
    ]);
  });

  it('says so when no part has a value or all are hidden', () => {
    expect(say(parts([NaN, NaN]), 'Browsers')).toEqual(['Browsers has no values.']);
    expect(say(parts([1, 2, 3], { skip: () => true }), 'Browsers')).toEqual([
      'Browsers has no values.',
    ]);
    expect(say(parts([]), 'Browsers')).toEqual(['Browsers has no values.']);
  });

  it('gives a single bar as a single value, not as highest and lowest', () => {
    expect(say(parts([NaN, 42], { part: 'bar' }), 'Profit')).toEqual([
      'Profit has a single value, 42 (Safari).',
    ]);
  });

  it('ranks parts instead of giving shares when a value is negative', () => {
    // Shares of a whole mean nothing with a negative part: a funnel is ranked like bars then.
    expect(say(parts([10, -4, 6], { part: 'stage' }), 'Funnel')).toEqual([
      'Funnel is highest at Chrome (10) and lowest at Safari (-4).',
    ]);
    expect(say(parts([10, 4, 6], { part: 'stage' }), 'Funnel')).toEqual([
      'Chrome is the largest stage of Funnel: 50% (10).',
      'Next: Edge, 30% (6), and Safari, 20% (4).',
    ]);
  });
});

describe('grids (E17.2)', () => {
  function grid(nx: number, ny: number, z: readonly number[]): GridInsight {
    return {
      kind: 'grid',
      nx,
      ny,
      z,
      xText: (i) => ['a', 'b', 'c'][i]!,
      yText: (j) => ['r1', 'r2'][j]!,
      formatValue: plain,
    };
  }

  it('finds the extremes wherever they are in the grid', () => {
    // Rows: r1 (9 + 1) / 2 = 5, r2 (3 + 4) / 2 = 3.5. Columns: a (9 + 3) / 2 = 6, b 2.5.
    expect(say(grid(2, 2, [9, 1, 3, 4]), 'Heat')).toEqual([
      'Heat: values range from 1 to 9.',
      'The highest value, 9, is at a, r1; the lowest, 1, at b, r1.',
      'Highest average by row: r1 (5); by column: a (6).',
    ]);
  });

  it('never picks a row or column without values as the hottest', () => {
    expect(say(grid(2, 2, [NaN, NaN, 1, 2]), 'Heat')).toEqual([
      'Heat: values range from 1 to 2.',
      'The highest value, 2, is at b, r2; the lowest, 1, at a, r2.',
      'Highest average by row: r2 (1.5); by column: b (2).',
    ]);
  });

  it('compares rows and columns only when there are several of both', () => {
    expect(say(grid(3, 1, [1, 5, 2]), 'Heat')).toEqual([
      'Heat: values range from 1 to 5.',
      'The highest value, 5, is at b, r1; the lowest, 1, at a, r1.',
    ]);
  });

  it('names no hot spot when every cell has the same value', () => {
    expect(say(grid(3, 1, [2, 2, 2]), 'Heat')).toEqual(['Heat: values range from 2 to 2.']);
  });

  it('says so when no cell has a value', () => {
    expect(say(grid(2, 2, [NaN, NaN, NaN, NaN]), 'Heat')).toEqual(['Heat has no values.']);
  });
});

describe('prices (E17.2)', () => {
  function prices(extra: Partial<PricesInsight> = {}): PricesInsight {
    return {
      kind: 'prices',
      points: [0, 1, 2],
      x: [0, 1, 2],
      open: [100, 104, 106],
      high: [105, 109, 108],
      low: [95, 90, 101],
      close: [104, 106, 100],
      formatX: (i) => MONTHS[i]!,
      formatY: plain,
      ...extra,
    };
  }

  it('says when the last close equals the first open, with the range in between', () => {
    expect(say(prices(), 'ACME')).toEqual([
      'ACME closes at 100 (Mar), where it opened (Jan).',
      'Highest high 109 (Feb); lowest low 90 (Feb).',
    ]);
  });

  it('gives the change in price units when the open is not positive (no percentage of 0)', () => {
    expect(say(prices({ open: [0, 104, 106], close: [104, 106, 12] }), 'Spread')[0]).toBe(
      'Spread rises 12 from an open of 0 (Jan) to a close of 12 (Mar).',
    );
    expect(say(prices({ open: [-4, 104, 106], close: [104, 106, -10] }), 'Spread')[0]).toBe(
      'Spread falls 6 from an open of -4 (Jan) to a close of -10 (Mar).',
    );
  });

  it('reads only the points drawn', () => {
    // Point 1 holds the extremes but is not drawn.
    expect(say(prices({ points: [0, 2] }), 'ACME')).toEqual([
      'ACME closes at 100 (Mar), where it opened (Jan).',
      'Highest high 108 (Mar); lowest low 95 (Jan).',
    ]);
    expect(say(prices({ points: [] }), 'ACME')).toEqual(['ACME has no values.']);
  });
});

describe('single values (E17.2)', () => {
  const value = (v: number, reference?: number): string[] => {
    const insight: ValueInsight = {
      kind: 'value',
      value: v,
      ...(reference === undefined ? {} : { reference }),
      formatValue: (n) => `$${n}`,
    };
    return say(insight, 'Revenue');
  };

  it('says so when there is no value', () => {
    expect(value(NaN, 400)).toEqual(['Revenue has no values.']);
  });

  it('ignores a reference that is not a number', () => {
    expect(value(400, NaN)).toEqual(['Revenue is $400.']);
  });

  it('gives the change without a percentage against a reference of 0', () => {
    expect(value(50, 0)).toEqual(['Revenue is $50, up $50 from $0.']);
    expect(value(-50, 0)).toEqual(['Revenue is $-50, down $50 from $0.']);
  });
});
