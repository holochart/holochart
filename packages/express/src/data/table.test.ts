import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  columnTypes,
  inferColumnType,
  isMissing,
  plainValue,
  Table,
  toTable,
  type ArrowLikeTable,
} from './table.ts';

/** A tiny stand-in for an `apache-arrow` Table: schema fields, `numRows`, `getChild(name)`. */
function fakeArrow(columns: Record<string, unknown[]>, withToArray = true): ArrowLikeTable {
  const names = Object.keys(columns);
  return {
    numRows: columns[names[0] as string]?.length ?? 0,
    schema: { fields: names.map((name) => ({ name })) },
    getChild(name) {
      const values = columns[name];
      if (!values) return null;
      return {
        length: values.length,
        get: (i: number) => values[i],
        ...(withToArray ? { toArray: () => values } : {}),
      };
    },
  };
}

describe('toTable', () => {
  it('reads rows, with columns in first-seen key order', () => {
    const t = toTable([
      { a: 1, b: 'x' },
      { b: 'y', c: true },
    ]);
    expect(t.names).toEqual(['a', 'b', 'c']);
    expect(t.length).toBe(2);
    expect(t.column('a')).toEqual([1, undefined]);
    expect(t.column('c')).toEqual([undefined, true]);
  });

  it('reads columns (typed arrays become plain arrays)', () => {
    const t = toTable({ a: Float64Array.of(1, 2), b: ['x', 'y'] });
    expect(t.column('a')).toEqual([1, 2]);
    expect(Array.isArray(t.column('a'))).toBe(true);
  });

  it('reads Arrow-like tables, with or without toArray, bigints as numbers', () => {
    for (const withToArray of [true, false]) {
      const t = toTable(fakeArrow({ n: [1n, 2n], s: ['a', null] }, withToArray));
      expect(t.names).toEqual(['n', 's']);
      expect(t.column('n')).toEqual([1, 2]);
      expect(t.column('s')).toEqual(['a', null]);
      expect(t.type('n')).toBe('numeric');
    }
  });

  it('passes tables through and makes an empty table of nothing', () => {
    const t = toTable([{ a: 1 }]);
    expect(toTable(t)).toBe(t);
    expect(toTable(undefined).length).toBe(0);
    expect(toTable(null).names).toEqual([]);
  });

  it('rejects columns of different lengths, non-arrays and CSV text', () => {
    expect(() => toTable({ a: [1, 2], b: [1] })).toThrow(/same length/);
    expect(() => toTable({ a: 3 } as never)).toThrow(/not an array/);
    expect(() => toTable('a,b\n1,2' as never)).toThrow(/fromCSV/);
    expect(() => toTable([1, 2] as never)).toThrow(/rows must be objects/);
  });

  it('names the columns when one is missing', () => {
    expect(() => toTable([{ a: 1, b: 2 }]).column('c')).toThrow(
      "no column 'c' in the data. Expected one of ['a', 'b'].",
    );
  });

  it('adds columns and converts back to rows and columns', () => {
    const t = toTable([{ a: 1 }, { a: 2 }]).withColumn('b', ['x', 'y']);
    expect(t.toRows()).toEqual([
      { a: 1, b: 'x' },
      { a: 2, b: 'y' },
    ]);
    expect(t.toColumns()).toEqual({ a: [1, 2], b: ['x', 'y'] });
    expect(() => t.withColumn('c', [1])).toThrow(/has 1 values/);
  });

  it('round-trips rows ↔ columns (property)', () => {
    const row = fc.record({ a: fc.integer(), b: fc.string(), c: fc.boolean() });
    fc.assert(
      fc.property(fc.array(row, { minLength: 1 }), (rows) => {
        const t = toTable(rows);
        expect(toTable(t.toColumns()).toRows()).toEqual(rows);
      }),
    );
  });
});

describe('column types', () => {
  it('infers numeric, date and categorical columns like pandas dtypes', () => {
    expect(inferColumnType([1, 2.5, NaN, null])).toBe('numeric');
    expect(inferColumnType([1n, 2])).toBe('numeric');
    expect(inferColumnType(['2024-01-01', '2024-02-01 12:30', undefined])).toBe('date');
    expect(inferColumnType([new Date(0), '2024-03'])).toBe('date');
    expect(inferColumnType(['1', '2'])).toBe('categorical');
    expect(inferColumnType([true, false])).toBe('categorical');
    expect(inferColumnType([1, 'a'])).toBe('categorical');
    expect(inferColumnType(['03/01/2024'])).toBe('categorical');
    expect(inferColumnType([null, undefined])).toBe('categorical');
  });

  it('caches per column and lists every column', () => {
    const t = new Table({ n: [1, 2], d: ['2020-01-01', '2020-01-02'], c: ['x', 'y'] });
    expect(t.type('n')).toBe('numeric');
    expect(columnTypes(t)).toEqual({ n: 'numeric', d: 'date', c: 'categorical' });
  });

  it('writes dates as Plotly date strings and bigints as numbers', () => {
    expect(plainValue(new Date(Date.UTC(2024, 2, 1)))).toBe('2024-03-01');
    expect(plainValue(new Date(Date.UTC(2024, 2, 1, 12, 30)))).toBe('2024-03-01 12:30');
    expect(plainValue(new Date(NaN))).toBeNull();
    expect(plainValue(5n)).toBe(5);
    expect(plainValue('x')).toBe('x');
    expect(isMissing(NaN)).toBe(true);
    expect(isMissing(0)).toBe(false);
  });
});
