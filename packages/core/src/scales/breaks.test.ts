import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createBreakMap, normalizeRangeBreak, rawScale } from './breaks.ts';
import type { BreakMap, RangeBreakInput } from './breaks.ts';
import { ONEDAY, ONEHOUR, ONEWEEK } from './date-math.ts';
import { createScale } from './scale.ts';

const DAY = ONEDAY;
const HOUR = ONEHOUR;
const utc = (y: number, mo = 1, d = 1, h = 0, mi = 0): number => Date.UTC(y, mo - 1, d, h, mi);
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 16);

function map(breaks: RangeBreakInput[], type: 'date' | 'linear' = 'date'): BreakMap {
  const m = createBreakMap(breaks, type);
  if (m === undefined) throw new Error('expected a break map');
  return m;
}

const WEEKENDS: RangeBreakInput = { bounds: ['sat', 'mon'] };
const NIGHTS: RangeBreakInput = { bounds: [17, 9], pattern: 'hour' };

// 2024-01-05 is a Friday, 2024-01-08 a Monday.
const FRI = utc(2024, 1, 5);
const MON = utc(2024, 1, 8);

describe('normalizeRangeBreak (Plotly item defaults)', () => {
  it('reads day names as a day-of-week pattern', () => {
    expect(normalizeRangeBreak({ bounds: ['sat', 'mon'] }, 'date')).toEqual({
      kind: 'pattern',
      pattern: 'day of week',
      bounds: [6, 1],
    });
    expect(normalizeRangeBreak({ bounds: ['Saturday', 'SUN'] }, 'date')).toMatchObject({
      bounds: [6, 0],
    });
    // One name is enough; numbers (and numeric strings) are day indices.
    expect(normalizeRangeBreak({ bounds: ['sat', '1'] }, 'date')).toMatchObject({
      bounds: [6, 1],
    });
    expect(normalizeRangeBreak({ bounds: [6, 1], pattern: 'day of week' }, 'date')).toMatchObject({
      bounds: [6, 1],
    });
  });

  it('disables invalid pattern bounds', () => {
    const dow = (bounds: unknown[]) =>
      normalizeRangeBreak({ bounds, pattern: 'day of week' }, 'date');
    expect(dow([7, 1])).toBeUndefined();
    expect(dow([1.5, 3])).toBeUndefined();
    expect(dow([-1, 3])).toBeUndefined();
    expect(dow(['foo', 3])).toBeUndefined();
    const hour = (bounds: unknown[]) => normalizeRangeBreak({ bounds, pattern: 'hour' }, 'date');
    expect(hour([17, 9])).toMatchObject({ bounds: [17, 9] });
    expect(hour([9.5, 24])).toMatchObject({ bounds: [9.5, 24] });
    expect(hour([25, 9])).toBeUndefined();
    expect(hour([-1, 9])).toBeUndefined();
    // Day names are not hours.
    expect(hour(['sat', 'mon'])).toBeUndefined();
  });

  it('converts and sorts single-span bounds, and drops spans hiding a fixed range', () => {
    expect(normalizeRangeBreak({ bounds: ['2024-01-10', '2024-01-05'] }, 'date')).toEqual({
      kind: 'span',
      min: utc(2024, 1, 5),
      max: utc(2024, 1, 10),
    });
    expect(normalizeRangeBreak({ bounds: ['junk', '2024-01-05'] }, 'date')).toBeUndefined();
    expect(normalizeRangeBreak({ bounds: [20, 10] }, 'linear')).toEqual({
      kind: 'span',
      min: 10,
      max: 20,
    });
    expect(
      normalizeRangeBreak({ bounds: [0, 100] }, 'linear', { fixedRange: [10, 20] }),
    ).toBeUndefined();
    expect(
      normalizeRangeBreak({ bounds: [0, 100] }, 'linear', { fixedRange: [20, 10] }),
    ).toBeUndefined();
    expect(normalizeRangeBreak({ bounds: [0, 15] }, 'linear', { fixedRange: [10, 20] })).toEqual({
      kind: 'span',
      min: 0,
      max: 15,
    });
  });

  it('reads values with dvalue (default one day)', () => {
    expect(normalizeRangeBreak({ values: ['2024-12-25', '2024-01-01'] }, 'date')).toEqual({
      kind: 'values',
      values: [utc(2024), utc(2024, 12, 25)],
      dvalue: DAY,
    });
    expect(normalizeRangeBreak({ values: [3, 'x', 1], dvalue: 0.5 }, 'linear')).toEqual({
      kind: 'values',
      values: [1, 3],
      dvalue: 0.5,
    });
    expect(normalizeRangeBreak({ values: [1], dvalue: -1 }, 'linear')).toMatchObject({
      dvalue: DAY,
    });
    expect(normalizeRangeBreak({ values: [] }, 'date')).toBeUndefined();
    expect(normalizeRangeBreak({}, 'date')).toBeUndefined();
    // Too few bounds: values decide.
    expect(normalizeRangeBreak({ bounds: [1], values: [5] }, 'linear')).toMatchObject({
      kind: 'values',
    });
  });

  it('honors enabled and the axis type', () => {
    expect(normalizeRangeBreak({ enabled: false, bounds: ['sat', 'mon'] }, 'date')).toBeUndefined();
    expect(normalizeRangeBreak({ bounds: ['sat', 'mon'] }, 'linear')).toBeUndefined();
    expect(normalizeRangeBreak({ bounds: [17, 9], pattern: 'hour' }, 'linear')).toBeUndefined();
    expect(normalizeRangeBreak({ bounds: [1, 2] }, 'log')).toBeUndefined();
    expect(normalizeRangeBreak({ bounds: [1, 2] }, 'category')).toBeUndefined();
  });
});

describe('createBreakMap', () => {
  it('is undefined without enabled breaks, on other axis types, or when everything is hidden', () => {
    expect(createBreakMap(undefined, 'date')).toBeUndefined();
    expect(createBreakMap([], 'date')).toBeUndefined();
    expect(createBreakMap([{ enabled: false, bounds: ['sat', 'mon'] }], 'date')).toBeUndefined();
    expect(createBreakMap([{ bounds: [1, 2] }], 'log')).toBeUndefined();
    expect(createBreakMap([WEEKENDS], 'linear')).toBeUndefined();
    // All seven days, or all 24 hours.
    expect(createBreakMap([{ bounds: [0, 0], pattern: 'hour' }], 'date')).toBeDefined();
    expect(createBreakMap([{ bounds: [0, 24], pattern: 'hour' }], 'date')).toBeUndefined();
    expect(createBreakMap([{ bounds: ['mon', 'fri'] }, { bounds: ['fri', 'mon'] }], 'date')).toBe(
      undefined,
    );
  });

  it('hides weekends (Sat 00:00 → Mon 00:00)', () => {
    const b = map([WEEKENDS]);
    expect(b.hasDayOfWeek).toBe(true);
    expect(b.toLinear(0)).toBe(0);
    expect(b.inBreak(FRI + 23 * HOUR)).toBe(false);
    expect(b.inBreak(FRI + DAY)).toBe(true);
    expect(b.inBreak(MON - 1)).toBe(true);
    expect(b.inBreak(MON)).toBe(false);
    // Friday noon → Monday noon is one day of linear space.
    expect(b.toLinear(MON + 12 * HOUR) - b.toLinear(FRI + 12 * HOUR)).toBe(DAY);
    // The whole weekend is one linear point, which maps back to its end.
    expect(b.toLinear(FRI + DAY)).toBe(b.toLinear(MON));
    expect(b.toLinear(MON - 1)).toBe(b.toLinear(MON));
    expect(b.toRaw(b.toLinear(FRI + 30 * HOUR))).toBe(MON);
    expect(b.toRaw(b.toLinear(MON), true)).toBe(FRI + DAY);
    expect(b.moveOutside(FRI + 30 * HOUR)).toBe(MON);
    expect(b.moveOutside(FRI)).toBe(FRI);
    // Five days per week, any week.
    for (const t of [utc(1950, 3, 1), utc(1970), utc(2024, 7, 4, 13), utc(2200, 5, 5)]) {
      expect(b.toLinear(t + ONEWEEK) - b.toLinear(t)).toBe(5 * DAY);
    }
  });

  it('hides nights (hour pattern wrapping past midnight)', () => {
    const b = map([NIGHTS]);
    expect(b.hasDayOfWeek).toBe(false);
    expect(b.inBreak(FRI + 17 * HOUR)).toBe(true);
    expect(b.inBreak(FRI + 9 * HOUR - 1)).toBe(true);
    expect(b.inBreak(FRI + 9 * HOUR)).toBe(false);
    expect(b.inBreak(FRI + 17 * HOUR - 1)).toBe(false);
    expect(b.moveOutside(FRI + 20 * HOUR)).toBe(FRI + DAY + 9 * HOUR);
    expect(b.toLinear(FRI + DAY + 10 * HOUR) - b.toLinear(FRI + 16 * HOUR)).toBe(2 * HOUR);
    expect(b.toLinear(0)).toBe(0);
    // Fractional hours.
    const half = map([{ bounds: [16.5, 9.5], pattern: 'hour' }]);
    expect(half.inBreak(FRI + 9 * HOUR + 29 * 60_000)).toBe(true);
    expect(half.inBreak(FRI + 9.5 * HOUR)).toBe(false);
    expect(half.toLinear(FRI + DAY) - half.toLinear(FRI)).toBe(7 * HOUR);
  });

  it('removes exactly the same time from every UTC day and week (no DST in UTC)', () => {
    const nights = map([NIGHTS]);
    const both = map([WEEKENDS, NIGHTS]);
    const start = utc(2023, 1, 1);
    for (let d = 0; d < 3 * 366; d++) {
      const t = start + d * DAY;
      expect(nights.toLinear(t + DAY) - nights.toLinear(t)).toBe(8 * HOUR);
      expect(both.toLinear(t + ONEWEEK) - both.toLinear(t)).toBe(5 * 8 * HOUR);
    }
  });

  it('merges overlapping breaks (weekends + nights)', () => {
    const b = map([WEEKENDS, NIGHTS]);
    // Friday 17:00 → Monday 09:00 is a single break.
    expect(b.toLinear(FRI + 17 * HOUR)).toBe(b.toLinear(MON + 9 * HOUR));
    expect(b.toRaw(b.toLinear(FRI + 17 * HOUR))).toBe(MON + 9 * HOUR);
    expect(b.toRaw(b.toLinear(MON + 9 * HOUR), true)).toBe(FRI + 17 * HOUR);
    expect(b.moveOutside(FRI + 18 * HOUR)).toBe(MON + 9 * HOUR);
    expect(b.moveOutside(MON + 8 * HOUR)).toBe(MON + 9 * HOUR);
    expect(b.breaksIn(FRI, MON + DAY).map((r) => [iso(r.min), iso(r.max)])).toEqual([
      ['2024-01-05T00:00', '2024-01-05T09:00'],
      ['2024-01-05T17:00', '2024-01-08T09:00'],
      ['2024-01-08T17:00', '2024-01-09T00:00'],
    ]);
    // Same map from the other order.
    expect(map([NIGHTS, WEEKENDS]).key).toBe(b.key);
    expect(map([NIGHTS]).key).not.toBe(b.key);
  });

  it('handles wrap-around and zero-length day-of-week patterns', () => {
    // Friday → Tuesday: Fri, Sat, Sun, Mon hidden.
    const b = map([{ bounds: ['fri', 'tue'] }]);
    expect(b.inBreak(FRI - 1)).toBe(false);
    expect(b.inBreak(FRI)).toBe(true);
    expect(b.inBreak(MON + DAY - 1)).toBe(true);
    expect(b.moveOutside(FRI)).toBe(MON + DAY);
    expect(b.toLinear(FRI + ONEWEEK) - b.toLinear(FRI)).toBe(3 * DAY);
    // Monday → Friday: Mon–Thu hidden.
    const midweek = map([{ bounds: ['mon', 'fri'] }]);
    expect(midweek.inBreak(MON + 3 * DAY)).toBe(true);
    expect(midweek.inBreak(FRI)).toBe(false);
    // Equal bounds hide nothing (Plotly's zero-length break), but count as day-of-week breaks.
    const none = map([{ bounds: ['wed', 'wed'] }]);
    expect(none.hasDayOfWeek).toBe(true);
    expect(none.inBreak(MON + 2 * DAY)).toBe(false);
    expect(none.toLinear(FRI)).toBe(FRI);
    expect(none.toRaw(FRI)).toBe(FRI);
  });

  it('cuts out values + dvalue and single spans, merged with patterns', () => {
    // Monday 2024-01-15 is a holiday: Fri 17:00 → Tue 09:00 is one break.
    const b = map([WEEKENDS, NIGHTS, { values: ['2024-01-15'] }]);
    const fri = utc(2024, 1, 12);
    const tue = utc(2024, 1, 16);
    expect(b.inBreak(tue - DAY + 12 * HOUR)).toBe(true);
    expect(b.toLinear(fri + 17 * HOUR)).toBe(b.toLinear(tue + 9 * HOUR));
    expect(b.toRaw(b.toLinear(fri + 17 * HOUR))).toBe(tue + 9 * HOUR);
    expect(b.toRaw(b.toLinear(tue + 9 * HOUR), true)).toBe(fri + 17 * HOUR);
    expect(b.moveOutside(fri + 20 * HOUR)).toBe(tue + 9 * HOUR);
    expect(b.toLinear(tue + 10 * HOUR) - b.toLinear(fri + 16 * HOUR)).toBe(2 * HOUR);
    expect(
      b.breaksIn(fri + 12 * HOUR, tue + 12 * HOUR).map((r) => [iso(r.min), iso(r.max)]),
    ).toEqual([['2024-01-12T17:00', '2024-01-16T09:00']]);

    // A single span on a date axis.
    const span = map([{ bounds: ['2024-01-10', '2024-01-20'] }]);
    expect(span.toLinear(utc(2024, 1, 25)) - span.toLinear(utc(2024, 1, 5))).toBe(10 * DAY);
    expect(span.toRaw(span.toLinear(utc(2024, 1, 15)))).toBe(utc(2024, 1, 20));
    expect(span.toRaw(span.toLinear(utc(2024, 1, 15)), true)).toBe(utc(2024, 1, 10));
    expect(span.hasDayOfWeek).toBe(false);
  });

  it('works on linear axes (bounds and values)', () => {
    const b = map([{ bounds: [20, 10] }, { values: [100, 102], dvalue: 5 }], 'linear');
    expect(b.toLinear(0)).toBe(0);
    expect(b.toLinear(5)).toBe(5);
    expect(b.toLinear(-5)).toBe(-5);
    expect(b.toLinear(15)).toBe(10);
    expect(b.toLinear(25)).toBe(15);
    // [100, 107) after merging the two values.
    expect(b.toLinear(110)).toBe(110 - 10 - 7);
    expect(b.toRaw(10)).toBe(20);
    expect(b.toRaw(10, true)).toBe(10);
    expect(b.toRaw(90)).toBe(107);
    expect(b.inBreak(10)).toBe(true);
    expect(b.inBreak(20)).toBe(false);
    expect(b.inBreak(106.9)).toBe(true);
    expect(b.breaksIn(0, 200)).toEqual([
      { min: 10, max: 20 },
      { min: 100, max: 107 },
    ]);
    expect(b.breaksIn(15, 101)).toEqual([
      { min: 15, max: 20 },
      { min: 100, max: 101 },
    ]);
    // An anchor inside a break still maps to 0.
    const around = map([{ bounds: [-1, 1] }], 'linear');
    expect(around.toLinear(0)).toBe(0);
    expect(around.toLinear(5)).toBe(4);
    expect(around.toLinear(-5)).toBe(-4);
  });

  it('passes non-finite values through', () => {
    const b = map([WEEKENDS, { values: ['2024-01-15'] }]);
    expect(b.toLinear(Number.NaN)).toBeNaN();
    expect(b.toRaw(Number.NaN)).toBeNaN();
    expect(b.toLinear(Infinity)).toBe(Infinity);
    expect(b.inBreak(Number.NaN)).toBe(false);
    expect(b.moveOutside(Number.NaN)).toBeNaN();
  });
});

describe('createBreakMap properties', () => {
  const maps = [
    map([WEEKENDS]),
    map([NIGHTS]),
    map([WEEKENDS, NIGHTS, { values: ['2024-01-15', '2024-02-19', '2024-12-25'] }]),
    map([{ bounds: ['fri', 'tue'] }, { bounds: [3.25, 3.75], pattern: 'hour' }]),
    map([{ bounds: ['2020-01-01', '2021-01-01'] }, { values: [0], dvalue: 3 * HOUR }, NIGHTS]),
  ];
  const arbMap = fc.constantFrom(...maps.keys());
  const arbRaw = fc.integer({ min: -1e14, max: 1e14 });

  it('is monotone, and toRaw inverts toLinear exactly outside breaks', () => {
    fc.assert(
      fc.property(arbMap, arbRaw, arbRaw, (i, a, c) => {
        const b = maps[i] as BreakMap;
        const la = b.toLinear(a);
        const lc = b.toLinear(c);
        if (a <= c) expect(la).toBeLessThanOrEqual(lc);
        const back = b.toRaw(la);
        expect(b.toLinear(back)).toBe(la);
        expect(b.inBreak(back)).toBe(false);
        if (!b.inBreak(a)) expect(back).toBe(a);
        else expect(back).toBe(b.moveOutside(a));
        const start = b.toRaw(la, true);
        expect(b.toLinear(start)).toBe(la);
        expect(start).toBeLessThanOrEqual(back);
      }),
      { numRuns: 2000 },
    );
  });

  it('round-trips linear values through toRaw', () => {
    fc.assert(
      fc.property(arbMap, arbRaw, (i, l) => {
        const b = maps[i] as BreakMap;
        const raw = b.toRaw(l);
        expect(b.toLinear(raw)).toBe(l);
        expect(b.inBreak(raw)).toBe(false);
        expect(b.toLinear(b.toRaw(l, true))).toBe(l);
      }),
      { numRuns: 2000 },
    );
  });

  it('agrees with breaksIn', () => {
    fc.assert(
      fc.property(arbMap, fc.integer({ min: -1e12, max: 1e13 }), (i, lo) => {
        const b = maps[i] as BreakMap;
        const hi = lo + 10 * ONEWEEK;
        let hidden = 0;
        let prev = -Infinity;
        for (const r of b.breaksIn(lo, hi)) {
          expect(r.min).toBeGreaterThan(prev);
          expect(r.max).toBeGreaterThan(r.min);
          expect(b.inBreak(r.min)).toBe(true);
          expect(b.inBreak(r.max) && r.max < hi).toBe(false);
          hidden += r.max - r.min;
          prev = r.max;
        }
        expect(b.toLinear(hi) - b.toLinear(lo)).toBe(hi - lo - hidden);
      }),
      { numRuns: 300 },
    );
  });
});

describe('createScale with breaks', () => {
  const b = map([WEEKENDS, NIGHTS]);
  const scale = (range: [number, number] = [b.toLinear(MON), b.toLinear(MON + 5 * DAY)]) =>
    createScale({ type: 'date', breaks: b, range, length: 400 });

  it('masks data inside breaks in d2l and d2lArray, typed arrays included', () => {
    const s = scale();
    expect(s.breaks).toBe(b);
    expect(s.d2l('2024-01-08 10:00')).toBe(b.toLinear(MON + 10 * HOUR));
    expect(s.d2l('2024-01-08 08:00')).toBeNaN();
    expect(s.d2l('2024-01-06')).toBeNaN();
    expect(s.d2l('junk')).toBeNaN();
    const data = [MON + 10 * HOUR, MON + 20 * HOUR, '2024-01-09 12:00', null];
    const want = [b.toLinear(MON + 10 * HOUR), NaN, b.toLinear(MON + DAY + 12 * HOUR), NaN];
    expect(Array.from(s.d2lArray(data))).toEqual(want);
    const typed = new Float64Array([MON + 10 * HOUR, MON + 20 * HOUR, MON + 36 * HOUR]);
    const out = new Float64Array(3);
    expect(s.d2lArray(typed, out)).toBe(out);
    expect(Array.from(out)).toEqual([b.toLinear(MON + 10 * HOUR), NaN, want[2]]);

    const lin = createScale({ type: 'linear', breaks: map([{ bounds: [10, 20] }], 'linear') });
    expect(Array.from(lin.d2lArray(new Int32Array([5, 15, 25])))).toEqual([5, NaN, 15]);
    expect(Array.from(lin.d2lArray([5, '15', '25', Infinity]))).toEqual([5, NaN, 15, NaN]);
    expect(lin.d2l(15)).toBeNaN();
  });

  it('compresses ranges without masking and expands on the way back', () => {
    const s = scale();
    // A range end inside a break is the break's linear point.
    expect(s.r2l('2024-01-06')).toBe(b.toLinear(MON + 9 * HOUR));
    expect(s.r2l('2024-01-08 10:00')).toBe(b.toLinear(MON + 10 * HOUR));
    expect(s.l2d(b.toLinear(MON + 10 * HOUR))).toBe(MON + 10 * HOUR);
    expect(s.l2r(b.toLinear(MON + 10 * HOUR))).toBe('2024-01-08 10:00');
    expect(s.l2r(s.r2l('2024-01-06'))).toBe('2024-01-08 09:00');
    expect(s.p2d(s.d2p('2024-01-09 13:00'))).toBe(MON + DAY + 13 * HOUR);
  });

  it('stays affine: l2p/p2l and d2p/p2d round-trip', () => {
    const s = scale();
    const { m, b: off } = s.affine();
    // Monday 09:00 → Friday 17:00 is 40 visible hours; the range covers 5 × 8 h.
    expect(s.d2p(MON + 9 * HOUR)).toBe(0);
    expect(s.d2p('2024-01-12 17:00')).toBeNaN();
    expect(s.l2p(s.r2l('2024-01-12 17:00'))).toBeCloseTo(400, 9);
    expect(s.d2p('2024-01-08 13:00')).toBeCloseTo(40, 9);
    fc.assert(
      fc.property(fc.integer({ min: -1e13, max: 1e13 }), (raw) => {
        const l = s.d2l(raw);
        if (Number.isNaN(l)) {
          expect(b.inBreak(raw)).toBe(true);
          return;
        }
        const p = s.l2p(l);
        expect(p).toBeCloseTo(l * m + off, 0);
        expect(s.p2l(p)).toBeCloseTo(l, -3);
        expect(Math.abs((s.p2d(s.d2p(raw)) as number) - raw)).toBeLessThan(
          1e-3 * Math.abs(raw) + 1,
        );
      }),
      { numRuns: 500 },
    );
  });

  it('is ignored on other axis types', () => {
    const lin = map([{ bounds: [10, 20] }], 'linear');
    expect(createScale({ type: 'log', breaks: lin }).breaks).toBeUndefined();
    expect(createScale({ type: 'log', breaks: lin }).d2l(1000)).toBe(3);
    expect(createScale({ type: 'category', breaks: lin, categories: ['a'] }).breaks).toBe(
      undefined,
    );
    expect(createScale({ type: 'linear' }).breaks).toBeUndefined();
  });

  it('rawScale spans the raw values shown', () => {
    const s = scale();
    const r = rawScale(s);
    expect(r.breaks).toBeUndefined();
    expect(r.type).toBe('date');
    expect(r.length).toBe(400);
    // The upper end sits on Friday 17:00's break point: the raw range ends there, not on Monday.
    expect(r.range).toEqual([MON + 9 * HOUR, utc(2024, 1, 12, 17)]);
    const rev = scale([b.toLinear(MON + 5 * DAY), b.toLinear(MON)]);
    expect(rawScale(rev).range).toEqual([utc(2024, 1, 12, 17), MON + 9 * HOUR]);
    const plain = createScale({ type: 'date' });
    expect(rawScale(plain)).toBe(plain);
  });
});
