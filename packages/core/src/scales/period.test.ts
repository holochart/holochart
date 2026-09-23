import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EPOCH_2000, ONEDAY, ONEHOUR, ONEWEEK, incrementMonth } from './date-math.ts';
import { alignPeriod, defaultPeriod0 } from './period.ts';

const utc = (y: number, m: number, d = 1, h = 0): number => Date.UTC(y, m - 1, d, h);

/** Align one value and return `[start, val, end]`. */
function one(v: number, opts: Parameters<typeof alignPeriod>[1]): [number, number, number] {
  const r = alignPeriod([v], opts);
  if (r === undefined) throw new Error('expected a valid period');
  return [r.starts[0] as number, r.vals[0] as number, r.ends[0] as number];
}

describe('alignPeriod: fixed periods on date axes', () => {
  it('day periods, middle alignment by default', () => {
    const v = utc(2024, 1, 1, 13);
    expect(one(v, { period: ONEDAY, isDate: true })).toEqual([
      utc(2024, 1, 1),
      utc(2024, 1, 1, 12),
      utc(2024, 1, 2),
    ]);
  });

  it('start / end alignment', () => {
    const v = utc(2024, 1, 1, 13);
    expect(one(v, { period: ONEDAY, isDate: true, alignment: 'start' })[1]).toBe(utc(2024, 1, 1));
    expect(one(v, { period: ONEDAY, isDate: true, alignment: 'end' })[1]).toBe(utc(2024, 1, 2));
  });

  it('periods are half-open: a boundary value starts its period', () => {
    expect(one(utc(2024, 1, 1), { period: ONEDAY, isDate: true })[0]).toBe(utc(2024, 1, 1));
  });

  it('week periods run Sunday to Sunday by default', () => {
    // 2024-01-03 is a Wednesday; the week starts Sunday 2023-12-31.
    const [start, , end] = one(utc(2024, 1, 3), { period: ONEWEEK, isDate: true });
    expect([start, end]).toEqual([utc(2023, 12, 31), utc(2024, 1, 7)]);
    expect(new Date(start).getUTCDay()).toBe(0);
    const [s2] = one(utc(2024, 1, 3), { period: 2 * ONEWEEK, isDate: true });
    expect(new Date(s2).getUTCDay()).toBe(0);
    expect((s2 - (EPOCH_2000 + ONEDAY)) % (2 * ONEWEEK)).toBe(0);
  });

  it('accepts numeric-string periods and a custom period0', () => {
    const [start, , end] = one(utc(2024, 1, 1, 1), {
      period: String(6 * ONEHOUR),
      period0: '2000-01-01 03:00',
      isDate: true,
    });
    expect([start, end]).toEqual([utc(2023, 12, 31, 21), utc(2024, 1, 1, 3)]);
    // period0 as ms.
    expect(one(utc(2024, 1, 1, 1), { period: ONEDAY, period0: ONEHOUR, isDate: true })[0]).toBe(
      utc(2024, 1, 1, 1),
    );
  });

  it('pre-epoch dates', () => {
    expect(one(utc(1969, 12, 31, 12), { period: ONEDAY, isDate: true })).toEqual([
      utc(1969, 12, 31),
      utc(1969, 12, 31, 12),
      utc(1970, 1, 1),
    ]);
    const [start] = one(utc(1901, 6, 5), { period: ONEWEEK, isDate: true });
    expect(new Date(start).getUTCDay()).toBe(0);
  });
});

describe('alignPeriod: month periods', () => {
  it('months', () => {
    const [start, mid, end] = one(utc(2024, 2, 15), { period: 'M1', isDate: true });
    expect([start, end]).toEqual([utc(2024, 2, 1), utc(2024, 3, 1)]);
    expect(mid).toBe((start + end) / 2);
    expect(one(utc(2024, 2, 1), { period: 'M1', isDate: true })[0]).toBe(utc(2024, 2, 1));
  });

  it('quarters and years', () => {
    const q = one(utc(2024, 5, 10), { period: 'M3', isDate: true, alignment: 'start' });
    expect(q).toEqual([utc(2024, 4, 1), utc(2024, 4, 1), utc(2024, 7, 1)]);
    const y = one(utc(2024, 6, 1), { period: 'M12', isDate: true, alignment: 'end' });
    expect(y).toEqual([utc(2024, 1, 1), utc(2025, 1, 1), utc(2025, 1, 1)]);
  });

  it('custom period0 and pre-epoch / far dates', () => {
    const r = one(utc(2024, 2, 10), { period: 'M1', period0: '2000-01-15', isDate: true });
    expect([r[0], r[2]]).toEqual([utc(2024, 1, 15), utc(2024, 2, 15)]);
    const old = one(utc(1850, 3, 10), { period: 'M1', isDate: true });
    expect([old[0], old[2]]).toEqual([utc(1850, 3, 1), utc(1850, 4, 1)]);
    const far = one(utc(9000, 7, 20), { period: 'M12', isDate: true });
    expect([far[0], far[2]]).toEqual([utc(9000, 1, 1), utc(9001, 1, 1)]);
  });

  it('property: each value lies in a whole-month period starting on the 1st', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: utc(1700, 1, 1), max: utc(2300, 1, 1) }),
        fc.integer({ min: 1, max: 24 }),
        (v, n) => {
          const [start, , end] = one(v, { period: `M${n}`, isDate: true });
          const d = new Date(start);
          return (
            start <= v &&
            v < end &&
            end === incrementMonth(start, n) &&
            d.getUTCDate() === 1 &&
            d.getUTCHours() === 0
          );
        },
      ),
    );
  });
});

describe('alignPeriod: other axes, invalid input, output reuse', () => {
  it('numeric periods on non-date axes (period0 defaults to 0)', () => {
    const r = alignPeriod([0, 7, -3, 10], { period: 5, isDate: false, alignment: 'start' });
    expect(Array.from(r?.vals ?? [])).toEqual([0, 5, -5, 10]);
    expect(Array.from(r?.ends ?? [])).toEqual([5, 10, 0, 15]);
    const shifted = alignPeriod([7], { period: '5', period0: '2', isDate: false });
    expect(Array.from(shifted?.vals ?? [])).toEqual([9.5]);
  });

  it('returns undefined for invalid periods', () => {
    for (const period of [
      0,
      -1,
      NaN,
      Infinity,
      'M0',
      'M1.5',
      'M-2',
      'x',
      '',
      ' ',
      null,
      undefined,
    ]) {
      expect(alignPeriod([1], { period, isDate: true }), String(period)).toBeUndefined();
    }
    // Month periods are date-only.
    expect(alignPeriod([1], { period: 'M1', isDate: false })).toBeUndefined();
  });

  it('falls back to the default period0 when it is invalid', () => {
    const a = one(utc(2024, 1, 3), { period: ONEWEEK, period0: 'garbage', isDate: true });
    expect(a[0]).toBe(utc(2023, 12, 31));
    const b = one(3, { period: 2, period0: null, isDate: false });
    expect(b[0]).toBe(2);
  });

  it('non-finite values give NaN', () => {
    const r = alignPeriod([NaN, Infinity, 1], { period: 1, isDate: false });
    expect(Array.from(r?.vals ?? [])).toEqual([NaN, NaN, 1.5]);
    expect(Array.from(r?.starts ?? [])).toEqual([NaN, NaN, 1]);
  });

  it('reuses output arrays of the right length', () => {
    const out = {
      vals: new Float64Array(2),
      starts: new Float64Array(2),
      ends: new Float64Array(3),
    };
    const r = alignPeriod(new Float64Array([1.5, 2.5]), { period: 1, isDate: false, out });
    expect(r?.vals).toBe(out.vals);
    expect(r?.starts).toBe(out.starts);
    expect(r?.ends).not.toBe(out.ends);
    expect(Array.from(r?.ends ?? [])).toEqual([2, 3]);
  });

  it('property: fixed periods contain their value and tile from period0', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e12, max: 1e12, noNaN: true }),
        fc.double({ min: 1e-3, max: 1e9, noNaN: true }),
        fc.double({ min: -1e6, max: 1e6, noNaN: true }),
        (v, period, period0) => {
          const [start, mid, end] = one(v, { period, period0, isDate: false });
          const eps = 1e-9 * Math.max(1, Math.abs(v));
          return (
            start <= v + eps &&
            v < end + eps &&
            Math.abs(end - start - period) <= eps + 1e-9 * period &&
            start <= mid &&
            mid <= end
          );
        },
      ),
    );
  });
});

describe('defaultPeriod0', () => {
  it('2000-01-01, a Sunday for whole weeks, 0 off date axes', () => {
    expect(defaultPeriod0(ONEDAY, true)).toBe(EPOCH_2000);
    expect(defaultPeriod0('M1', true)).toBe(EPOCH_2000);
    expect(defaultPeriod0(ONEWEEK, true)).toBe(EPOCH_2000 + ONEDAY);
    expect(defaultPeriod0(3 * ONEWEEK, true)).toBe(EPOCH_2000 + ONEDAY);
    expect(defaultPeriod0('bad', true)).toBe(EPOCH_2000);
    expect(defaultPeriod0(ONEWEEK, false)).toBe(0);
  });
});
