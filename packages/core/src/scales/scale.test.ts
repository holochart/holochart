import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { cleanNumber, createScale, dateToMs, isTwoLevel } from './scale.ts';
import type { AxisType } from './types.ts';

const DAY = 86_400_000;

describe('cleanNumber / dateToMs', () => {
  it('reads numbers the way Plotly does', () => {
    expect(cleanNumber(3)).toBe(3);
    expect(cleanNumber(' 3.5 ')).toBe(3.5);
    expect(cleanNumber('$1,200')).toBe(1200);
    expect(cleanNumber('12%')).toBe(12);
    expect(cleanNumber('')).toBeNaN();
    expect(cleanNumber('abc')).toBeNaN();
    expect(cleanNumber(Infinity)).toBeNaN();
    expect(cleanNumber(null)).toBeNaN();
    expect(cleanNumber(true)).toBeNaN();
  });

  it('reads dates as UTC ms', () => {
    expect(dateToMs('2024-03-01')).toBe(Date.UTC(2024, 2, 1));
    expect(dateToMs('2024')).toBe(Date.UTC(2024, 0, 1));
    expect(dateToMs(new Date(5))).toBe(5);
    expect(dateToMs(new Date(NaN))).toBeNaN();
    expect(dateToMs(123)).toBe(123);
    expect(dateToMs('1500000000000')).toBe(1_500_000_000_000);
    expect(dateToMs('not a date')).toBeNaN();
    expect(dateToMs(NaN)).toBeNaN();
    expect(dateToMs({})).toBeNaN();
  });
});

describe('createScale: pixel mapping', () => {
  it('maps range[0] to 0 and range[1] to length, reversed included', () => {
    const s = createScale({ type: 'linear', range: [10, 20], length: 200 });
    expect(s.l2p(10)).toBe(0);
    expect(s.l2p(20)).toBe(200);
    expect(s.p2l(100)).toBe(15);
    const r = createScale({ type: 'linear', range: [20, 10], length: 200 });
    expect(r.l2p(20) === 0).toBe(true); // may be -0
    expect(r.l2p(10)).toBe(200);
    expect(r.p2l(50)).toBe(17.5);
  });

  it('exposes an equivalent affine form and updates on setRange/setLength', () => {
    const s = createScale({ type: 'linear' });
    expect(s.range).toEqual([0, 1]);
    expect(s.length).toBe(1);
    s.setRange(-5, 5);
    s.setLength(500);
    const { m, b } = s.affine();
    for (const l of [-5, 0, 3.3, 5]) expect(l * m + b).toBeCloseTo(s.l2p(l), 9);
  });

  it('does not divide by zero on a degenerate range', () => {
    const s = createScale({ type: 'linear', range: [3, 3], length: 10 });
    expect(Number.isFinite(s.l2p(4))).toBe(true);
    expect(Number.isFinite(s.affine().m)).toBe(true);
  });
});

describe('createScale: linear', () => {
  const s = createScale({ type: 'linear', range: [0, 10], length: 100 });
  it('converts data, range and display values', () => {
    expect(s.d2l('2.5')).toBe(2.5);
    expect(s.d2l('x')).toBeNaN();
    expect(s.r2l('4')).toBe(4);
    expect(s.l2r(4)).toBe(4);
    expect(s.l2d(4)).toBe(4);
    expect(s.d2p(5)).toBe(50);
    expect(s.p2d(50)).toBe(5);
    expect(s.categories).toEqual([]);
    expect(s.multicategories).toEqual([]);
  });

  it('d2lArray handles plain and typed arrays, reusing `out`', () => {
    expect(Array.from(s.d2lArray([1, '2', null, NaN, Infinity]))).toEqual([1, 2, NaN, NaN, NaN]);
    const out = new Float64Array(4);
    const res = s.d2lArray(new Float32Array([1.5, 2.5]), out);
    expect(res).toBe(out);
    expect(Array.from(out)).toEqual([1.5, 2.5, 0, 0]);
    expect(() => s.d2lArray([1, 2, 3], new Float64Array(2))).toThrow(RangeError);
  });
});

describe('createScale: log', () => {
  it('works in log10 space with exponent ranges', () => {
    const s = createScale({ type: 'log', range: [0, 3], length: 300 });
    expect(s.d2l(100)).toBe(2);
    expect(s.d2l('1000')).toBe(3);
    expect(s.d2l(0)).toBeNaN();
    expect(s.d2l(-1)).toBeNaN();
    expect(s.d2p(100)).toBe(200);
    expect(s.l2d(2)).toBe(100);
    expect(s.p2d(100)).toBeCloseTo(10, 12);
    // Log ranges are exponents (Plotly).
    expect(s.r2l(2)).toBe(2);
    expect(s.l2r(2)).toBe(2);
  });

  it('excludes non-positive values with a single warning', () => {
    const onWarning = vi.fn();
    const s = createScale({ type: 'log', onWarning });
    expect(Array.from(s.d2lArray([10, 0, -5, 'x', 100]))).toEqual([1, NaN, NaN, NaN, 2]);
    s.d2lArray(new Float64Array([-1, 1]));
    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(onWarning.mock.calls[0]?.[0]).toMatch(/non-positive/i);
    // Blank/non-numeric values alone are not "non-positive".
    const quiet = vi.fn();
    createScale({ type: 'log', onWarning: quiet }).d2lArray(['x', null]);
    expect(quiet).not.toHaveBeenCalled();
  });

  it('falls back to a process-wide warn-once console warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createScale({ type: 'log' }).d2lArray([0]);
    createScale({ type: 'log' }).d2lArray([-1]);
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
    warn.mockRestore();
  });
});

describe('createScale: date', () => {
  const s = createScale({ type: 'date', range: [0, 10 * DAY], length: 100 });
  it('accepts ms, Date and ISO strings', () => {
    expect(s.d2l('1970-01-02')).toBe(DAY);
    expect(s.d2l(new Date(DAY))).toBe(DAY);
    expect(s.d2l(DAY)).toBe(DAY);
    expect(s.d2l('nope')).toBeNaN();
    expect(s.r2l('1970-01-03')).toBe(2 * DAY);
    expect(s.l2r(2 * DAY + 3_600_000)).toBe('1970-01-03 01:00');
    expect(s.l2r(Infinity)).toBe(Infinity);
    expect(s.l2d(DAY)).toBe(DAY);
    expect(s.d2p('1970-01-06')).toBe(50);
  });

  it('d2lArray copies typed arrays and parses strings', () => {
    expect(Array.from(s.d2lArray(new Float64Array([1, 2])))).toEqual([1, 2]);
    expect(Array.from(s.d2lArray(['1970-01-02', new Date(0), 'x']))).toEqual([DAY, 0, NaN]);
  });
});

describe('createScale: category', () => {
  const s = createScale({
    type: 'category',
    categories: ['a', 'b', '3'],
    range: [-0.5, 2.5],
    length: 30,
  });
  it('maps categories to indices', () => {
    expect(s.categories).toEqual(['a', 'b', '3']);
    expect(s.d2l('b')).toBe(1);
    expect(s.d2l(3)).toBe(2);
    expect(s.d2l('zzz')).toBeNaN();
    expect(s.d2l(null)).toBeNaN();
    expect(s.d2l('')).toBeNaN();
    expect(s.l2d(1)).toBe('b');
    expect(s.l2d(1.2)).toBe('b');
    expect(s.l2d(7)).toBe(7);
    expect(s.p2d(5)).toBe('a');
    expect(Array.from(s.d2lArray(['a', 'x', 3]))).toEqual([0, NaN, 2]);
  });

  it('reads ranges as names or fractional indices', () => {
    expect(s.r2l('b')).toBe(1);
    expect(s.r2l(-0.5)).toBe(-0.5);
    expect(s.r2l('1.5')).toBe(1.5);
    expect(s.l2r(1.5)).toBe(1.5);
  });

  it('keeps the first index of duplicate categories', () => {
    expect(createScale({ type: 'category', categories: ['a', 'a', 'b'] }).d2l('b')).toBe(2);
  });
});

describe('createScale: multicategory', () => {
  const s = createScale({
    type: 'multicategory',
    multicategories: [
      ['g1', 'a'],
      ['g1', 'b'],
      ['g2', 'a'],
    ],
  });
  it('maps [group, item] pairs to indices', () => {
    expect(s.multicategories).toHaveLength(3);
    expect(s.d2l(['g2', 'a'])).toBe(2);
    expect(s.d2l(['g3', 'a'])).toBeNaN();
    expect(s.d2l('g1')).toBeNaN();
    expect(s.d2l([null, 'a'])).toBeNaN();
    expect(s.l2d(1)).toBe('b');
    expect(s.r2l(['g1', 'b'])).toBe(1);
    expect(s.r2l(0.5)).toBe(0.5);
  });

  it('d2lArray reads two-row data and arrays of pairs', () => {
    expect(
      Array.from(
        s.d2lArray([
          ['g1', 'g2', 'g1', 'g9'],
          ['b', 'a', 'a', 'a'],
        ]),
      ),
    ).toEqual([1, 2, 0, NaN]);
    expect(
      Array.from(
        s.d2lArray([
          ['g1', 'a'],
          ['g2', 'a'],
          ['g1', 'b'],
        ]),
      ),
    ).toEqual([0, 2, 1]);
  });

  it('accepts plain categories as single-group pairs', () => {
    const p = createScale({ type: 'multicategory', categories: ['x', 'y'] });
    expect(p.multicategories).toEqual([
      ['', 'x'],
      ['', 'y'],
    ]);
    expect(createScale({ type: 'multicategory' }).multicategories).toEqual([]);
  });

  it('isTwoLevel detects the two-row shape', () => {
    expect(isTwoLevel([[1], [2]])).toBe(true);
    expect(isTwoLevel([[1], 2])).toBe(false);
    expect(isTwoLevel([[1], [2], [3]])).toBe(false);
    expect(isTwoLevel('ab')).toBe(false);
  });
});

describe('round trips (property)', () => {
  const lengths = fc.double({ min: 1, max: 5000, noNaN: true });
  const range = fc
    .tuple(
      fc.double({ min: -1e6, max: 1e6, noNaN: true }),
      fc.double({ min: -1e6, max: 1e6, noNaN: true }),
    )
    .filter(([a, b]) => Math.abs(a - b) > 1e-3);

  it('p2l(l2p(l)) ≈ l on every affine type', () => {
    const type = fc.constantFrom<AxisType>('linear', 'log', 'date', 'category', 'multicategory');
    fc.assert(
      fc.property(
        type,
        range,
        lengths,
        fc.double({ min: -1e6, max: 1e6, noNaN: true }),
        (t, r, len, l) => {
          const s = createScale({ type: t, range: r, length: len });
          const scale = Math.max(1, Math.abs(l), Math.abs(r[0]), Math.abs(r[1]));
          expect(Math.abs(s.p2l(s.l2p(l)) - l)).toBeLessThanOrEqual(scale * 1e-9);
        },
      ),
    );
  });

  it('p2d(d2p(v)) ≈ v for linear values', () => {
    fc.assert(
      fc.property(range, lengths, fc.double({ min: -1e6, max: 1e6, noNaN: true }), (r, len, v) => {
        const s = createScale({ type: 'linear', range: r, length: len });
        const back = s.p2d(s.d2p(v)) as number;
        expect(Math.abs(back - v)).toBeLessThanOrEqual(1e-6 * Math.max(1, Math.abs(v), 1e6));
      }),
    );
  });

  it('p2d(d2p(v)) ≈ v for log values (relative)', () => {
    fc.assert(
      fc.property(fc.double({ min: 1e-10, max: 1e10, noNaN: true }), lengths, (v, len) => {
        const s = createScale({ type: 'log', range: [-10, 10], length: len });
        const back = s.p2d(s.d2p(v)) as number;
        expect(Math.abs(back - v) / v).toBeLessThan(1e-9);
      }),
    );
  });

  it('p2d(d2p(v)) ≈ v for dates, and ISO strings round-trip through l2r/r2l', () => {
    const ms = fc.integer({ min: -30_000_000_000_000, max: 30_000_000_000_000 });
    fc.assert(
      fc.property(ms, lengths, (v, len) => {
        const s = createScale({ type: 'date', range: [v - 1e9, v + 1e9], length: len });
        expect(Math.abs((s.p2d(s.d2p(v)) as number) - v)).toBeLessThan(1e-3);
        expect(s.r2l(s.l2r(v))).toBe(v);
        expect(s.d2l(new Date(v))).toBe(v);
      }),
    );
  });

  it('category d2l/l2d are inverse on the category list', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 30 }),
        (cats) => {
          const s = createScale({
            type: 'category',
            categories: cats,
            range: [-0.5, cats.length - 0.5],
            length: 300,
          });
          cats.forEach((c, i) => {
            expect(s.d2l(c)).toBe(i);
            expect(s.l2d(i)).toBe(c);
            expect(s.p2d(s.d2p(c))).toBe(c);
          });
        },
      ),
    );
  });

  it('d2lArray agrees with d2l element-wise', () => {
    const values = fc.array(fc.oneof(fc.double(), fc.string(), fc.constant(null), fc.date()), {
      maxLength: 30,
    });
    const type = fc.constantFrom<AxisType>('linear', 'log', 'date', 'category');
    fc.assert(
      fc.property(type, values, (t, vs) => {
        const s = createScale({ type: t, categories: vs.map(String), onWarning: () => {} });
        const arr = s.d2lArray(vs);
        vs.forEach((v, i) => expect(Object.is(arr[i], s.d2l(v)) || arr[i] === s.d2l(v)).toBe(true));
      }),
    );
  });
});

describe('log d2lArray (property-test regression)', () => {
  it('maps Infinity to NaN like d2l', () => {
    const s = createScale({ type: 'log' });
    expect(s.d2l(Infinity)).toBeNaN();
    expect(s.d2lArray([Infinity, 10])[0]).toBeNaN();
    expect(s.d2lArray([Infinity, 10])[1]).toBe(1);
  });
});
