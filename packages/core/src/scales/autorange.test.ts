import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { FullAxis } from '../defaults/types.ts';
import { autorange, concatExtremes, findExtremes } from './autorange.ts';
import { EPOCH_2000, ONEDAY } from './date-math.ts';
import { createScale } from './scale.ts';
import type { AxisExtremes, AxisType, ExtremePoint, Scale } from './types.ts';

const END_2000 = Date.UTC(2001, 0, 1);

function axis(over: Record<string, unknown> = {}): FullAxis {
  return { _id: 'x', autorange: true, rangemode: 'normal', range: [null, null], ...over } as never;
}

function scaleOf(type: AxisType = 'linear', length = 400, extra: object = {}): Scale {
  return createScale({ type, length, onWarning: () => undefined, ...extra });
}

function pt(l: number, padPx = 0, extrapad = false): ExtremePoint {
  return { l, padPx, extrapad };
}

/** Extremes of a trace spanning [lo, hi] with the same padding at both ends. */
function span(lo: number, hi: number, padPx = 0, extrapad = false): AxisExtremes {
  return { min: [pt(lo, padPx, extrapad)], max: [pt(hi, padPx, extrapad)] };
}

function run(
  extremes: AxisExtremes[],
  over: Record<string, unknown> = {},
  s: Scale = scaleOf(),
): [number, number] {
  return autorange(extremes, s, axis(over));
}

function close(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((e, i) => expect(actual[i]).toBeCloseTo(e, 9));
}

describe('findExtremes', () => {
  it('keeps only the two extreme values when pads are uniform', () => {
    const e = findExtremes(scaleOf(), [3, 1, 4, 1, 5, 9, 2, 6], { ppad: 5, padded: true });
    expect(e.min).toEqual([pt(1, 5, true)]);
    expect(e.max).toEqual([pt(9, 5, true)]);
  });

  it('accepts typed arrays and skips NaN, infinities and FP_SAFE-sized junk', () => {
    const data = new Float64Array([NaN, 2, Infinity, -Infinity, 7, 1e308, -1e308]);
    const e = findExtremes(scaleOf(), data);
    expect(e.min).toEqual([pt(2)]);
    expect(e.max).toEqual([pt(7)]);
  });

  it('converts data with d2l (numeric strings, dates, categories)', () => {
    expect(findExtremes(scaleOf(), ['$1,000', '5', 'x']).max).toEqual([pt(1000)]);
    const d = findExtremes(scaleOf('date'), ['2024-01-01', '2024-03-01']);
    expect(d.min[0]?.l).toBe(Date.UTC(2024, 0, 1));
    expect(d.max[0]?.l).toBe(Date.UTC(2024, 2, 1));
    const c = findExtremes(scaleOf('category', 400, { categories: ['a', 'b', 'c'] }), [
      'b',
      'c',
      'z',
    ]);
    expect([c.min[0]?.l, c.max[0]?.l]).toEqual([1, 2]);
    const m = findExtremes(
      scaleOf('multicategory', 400, {
        multicategories: [
          ['g', 'a'],
          ['g', 'b'],
          ['h', 'a'],
        ],
      }),
      [
        ['g', 'h'],
        ['b', 'a'],
      ],
    );
    expect([m.min[0]?.l, m.max[0]?.l]).toEqual([1, 2]);
  });

  it('returns empty lists when nothing is representable', () => {
    expect(findExtremes(scaleOf(), [])).toEqual({ min: [], max: [] });
    expect(findExtremes(scaleOf('log'), [0, -1, 'x'])).toEqual({ min: [], max: [] });
  });

  it('skips non-positive values on log axes and applies vpad in data units', () => {
    const s = scaleOf('log');
    const e = findExtremes(s, [-5, 0, 10, '1000']);
    expect(e.min[0]?.l).toBeCloseTo(1);
    expect(e.max[0]?.l).toBeCloseTo(3);
    // 10 ± 50: the lower end would be negative, so it is clipped to one decade below 60.
    const v = findExtremes(s, [10], { vpad: 50 });
    expect(v.min[0]?.l).toBeCloseTo(Math.log10(6));
    expect(v.max[0]?.l).toBeCloseTo(Math.log10(60));
    // Linearized vpad is in exponents.
    const lin = findExtremes(s, [100], { vpad: 1, vpadLinearized: true });
    expect([lin.min[0]?.l, lin.max[0]?.l]).toEqual([1, 3]);
    // Log values given as numeric strings in the per-point path.
    const arr = findExtremes(s, ['100', -1], { vpadplus: [900, 0] });
    expect(arr.min[0]?.l).toBeCloseTo(2);
    expect(arr.max[0]?.l).toBeCloseTo(3);
  });

  it('applies vpadplus/vpadminus and vpad arrays', () => {
    const e = findExtremes(scaleOf(), [0, 10], { vpadminus: 2, vpadplus: 3 });
    expect([e.min[0]?.l, e.max[0]?.l]).toEqual([-2, 13]);
    const a = findExtremes(scaleOf(), [0, 10], { vpad: [1, 4] });
    expect(a.min.map((p) => p.l)).toEqual([-1]);
    expect(a.max.map((p) => p.l)).toEqual([14]);
  });

  it('clips to zero with an unpadded baseline (tozero, linear only)', () => {
    const e = findExtremes(scaleOf(), [2, 5, 3], { tozero: true, padded: true, ppad: 4 });
    expect(e.min).toEqual([pt(0, 0, false)]);
    expect(e.max).toEqual([pt(5, 4, true)]);
    const neg = findExtremes(scaleOf(), [-2, -5], { tozero: true, padded: true });
    expect(neg.max).toEqual([pt(0, 0, false)]);
    expect(neg.min).toEqual([pt(-5, 0, true)]);
    // Ignored on log axes.
    const log = findExtremes(scaleOf('log'), [10, 100], { tozero: true });
    expect(log.min[0]?.l).toBeCloseTo(1);
  });

  it('maps ppadplus/ppadminus by screen direction', () => {
    const fwd = findExtremes(scaleOf(), [0, 10], { ppadplus: 7, ppadminus: 3 });
    expect(fwd.max[0]?.padPx).toBe(7);
    expect(fwd.min[0]?.padPx).toBe(3);
    const rev = findExtremes(
      createScale({ type: 'linear', range: [10, 0], length: 400 }),
      [0, 10],
      {
        ppadplus: 7,
        ppad: 1,
      },
    );
    // Reversed: "plus" (screen-increasing) is the data minimum side; the max side falls to ppad.
    expect(rev.min[0]?.padPx).toBe(7);
    expect(rev.max[0]?.padPx).toBe(1);
  });

  it('treats negative/NaN pads as 0 and ppadplus: 0 as unset (Plotly `||`)', () => {
    const e = findExtremes(scaleOf(), [0, 1], { ppad: -4, ppadplus: 0 });
    expect(e.max[0]?.padPx).toBe(0);
    const f = findExtremes(scaleOf(), [0, 1], { ppad: 6, ppadplus: 0 });
    expect(f.max[0]?.padPx).toBe(6);
    const g = findExtremes(scaleOf(), [0, 1], { ppad: [NaN, -3] });
    expect(g.max[0]?.padPx).toBe(0);
    expect(g.min[0]?.padPx).toBe(0);
  });

  it('keeps every non-dominated point with per-point pads', () => {
    const e = findExtremes(scaleOf(), [0, 5, 10], { ppad: [0, 0, 50] });
    expect(e.min).toEqual([pt(0), pt(10, 50)]);
    expect(e.max).toEqual([pt(10, 50)]);
    // The first-6/last sweep still visits every point.
    const n = 20;
    const vals = Array.from({ length: n }, (_, i) => (i === 12 ? 100 : i));
    const pads = Array.from({ length: n }, (_, i) => (i === 3 ? 30 : 1));
    const big = findExtremes(scaleOf(), vals, { ppad: pads });
    expect(big.max.map((p) => p.l)).toContain(100);
    expect(big.min.map((p) => p.l)).toEqual(expect.arrayContaining([0, 3]));
  });

  it('property: min ≤ every finite value ≤ max', () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fc.double({ min: -1e9, max: 1e9 }), fc.constant(NaN)), { minLength: 1 }),
        fc.boolean(),
        (values, perPoint) => {
          const opts = perPoint ? { ppad: values.map((_, i) => i % 7) } : { ppad: 3 };
          const e = findExtremes(scaleOf(), values, opts);
          const finite = values.filter(Number.isFinite);
          if (finite.length === 0) return e.min.length === 0 && e.max.length === 0;
          const lo = Math.min(...e.min.map((p) => p.l));
          const hi = Math.max(...e.max.map((p) => p.l));
          return finite.every((v) => lo <= v && v <= hi);
        },
      ),
    );
  });
});

describe('concatExtremes', () => {
  it('collapses dominated points across traces', () => {
    const s = scaleOf();
    const merged = concatExtremes(
      [
        { min: [pt(1, 5)], max: [pt(9, 5)] },
        { min: [pt(1, 10), pt(0, 2)], max: [pt(9, 5, true), pt(NaN)] },
      ],
      s,
    );
    // pad 10 dominates pad 5 at the same value; 0 (pad 2) is more extreme so both stay.
    expect(merged.min).toEqual([pt(1, 10), pt(0, 2)]);
    // extrapad dominates the same pad without it.
    expect(merged.max).toEqual([pt(9, 5, true)]);
  });

  it('adds an unpadded zero for tozero traces on linear scales only', () => {
    const e: AxisExtremes = { min: [pt(2)], max: [pt(5)], tozero: true };
    expect(concatExtremes([e], scaleOf()).min).toEqual([pt(0)]);
    expect(concatExtremes([e], scaleOf('log')).min).toEqual([pt(2)]);
  });
});

describe('autorange: padding', () => {
  it('pads markers by padPx + 5% extrapad (Plotly formula)', () => {
    // 400 px, pads 5 + 20 on both sides: m = 10 / (400 - 50).
    const m = 10 / 350;
    close(run([span(0, 10, 5, true)]), [-25 * m, 10 + 25 * m]);
  });

  it('pads by padPx alone without extrapad', () => {
    const m = 10 / 390;
    close(run([span(0, 10, 5)]), [-5 * m, 10 + 5 * m]);
  });

  it('is tight for lines-only traces', () => {
    expect(run([span(0, 10)])).toEqual([0, 10]);
  });

  it('drops padding that would leave the data under 10% of the axis', () => {
    expect(run([span(0, 10, 60)], {}, scaleOf('linear', 100))).toEqual([0, 10]);
  });

  it('uses unpadded values on zero-length axes', () => {
    expect(run([span(0, 10, 5, true)], {}, scaleOf('linear', 0))).toEqual([0, 10]);
  });

  it('merges traces and honors per-point pads', () => {
    const s = scaleOf('linear', 100);
    const e = findExtremes(s, [0, 5, 10], { ppad: [0, 0, 50] });
    close(autorange([e], s, axis()), [0, 20]);
    close(run([span(0, 5), span(2, 10)]), [0, 10]);
  });

  it('keeps every value on a zero-length axis (all pairs tie)', () => {
    expect(run([{ min: [pt(0), pt(-5, 1)], max: [pt(10)] }], {}, scaleOf('linear', 0))).toEqual([
      -5, 10,
    ]);
  });

  it('picks the binding pair among several candidates', () => {
    // A heavily padded inner point can set the far end.
    const e: AxisExtremes = { min: [pt(0)], max: [pt(10), pt(9, 100)] };
    const m = 9 / 300;
    close(run([e]), [0, 9 + 100 * m]);
  });
});

describe('autorange: rangemode and tozero', () => {
  it('bars (findExtremes tozero) start at 0 unpadded', () => {
    const s = scaleOf();
    const e = findExtremes(s, [2, 5, 3], { tozero: true, padded: true });
    close(autorange([e], s, axis()), [0, 5 + (20 * 5) / 380]);
  });

  it('AxisExtremes.tozero includes 0 on linear axes only', () => {
    expect(run([{ ...span(2, 8), tozero: true }])).toEqual([0, 8]);
    close(run([{ ...span(1, 2), tozero: true }], {}, scaleOf('log')), [1, 2]);
  });

  it('rangemode tozero', () => {
    expect(run([span(2, 8)], { rangemode: 'tozero' })).toEqual([0, 8]);
    expect(run([span(-8, -2)], { rangemode: 'tozero' })).toEqual([-8, 0]);
    expect(run([span(-3, 5)], { rangemode: 'tozero' })).toEqual([-3, 5]);
    // Padded: only the far end keeps its padding.
    close(run([span(2, 8, 10)], { rangemode: 'tozero' }), [0, 8 + (10 * 8) / 390]);
  });

  it('rangemode nonnegative', () => {
    expect(run([span(-3, 5)], { rangemode: 'nonnegative' })).toEqual([0, 5]);
    expect(run([span(-5, -1)], { rangemode: 'nonnegative' })).toEqual([0, 1]);
    // The padding would cross zero: clamp there.
    expect(run([span(0.1, 5, 30)], { rangemode: 'nonnegative' })[0]).toBe(0);
    expect(run([span(2, 5)], { rangemode: 'nonnegative' })).toEqual([2, 5]);
  });

  it('rangemode is ignored off linear axes', () => {
    const s = scaleOf('category', 400, { categories: ['a', 'b', 'c'] });
    expect(run([span(1, 2)], { rangemode: 'tozero' }, s)).toEqual([1, 2]);
  });
});

describe('autorange: single value', () => {
  it('spans ±1 linear unit', () => {
    expect(run([span(3, 3, 5, true)])).toEqual([2, 4]);
    expect(run([span(1, 1)], {}, scaleOf('log'))).toEqual([0, 2]);
  });

  it('a later max candidate breaks the tie', () => {
    expect(run([{ min: [pt(3)], max: [pt(3, 20), pt(5)] }])).toEqual([3, 5]);
  });

  it('spans ±1 day on date axes', () => {
    const t = Date.UTC(2024, 5, 1);
    expect(run([span(t, t)], {}, scaleOf('date'))).toEqual([t - ONEDAY, t + ONEDAY]);
  });

  it('tozero: [0, 1] for a lone zero, Plotly rangeEnd otherwise', () => {
    expect(run([span(0, 0, 5)], { rangemode: 'tozero' })).toEqual([0, 1]);
    const s = scaleOf('linear', 100);
    close(run([span(5, 5, 10)], { rangemode: 'tozero' }, s), [0, 5 / 0.9]);
    close(run([span(-5, -5, 10)], { rangemode: 'tozero' }, s), [-5 / 0.9, 0]);
    // Padding is capped at half the axis.
    close(run([span(5, 5, 80)], { rangemode: 'tozero' }, s), [0, 10]);
    expect(run([span(5, 5, 10)], { rangemode: 'tozero' }, scaleOf('linear', 0))).toEqual([0, 5]);
  });

  it('nonnegative', () => {
    expect(run([span(0.5, 0.5)], { rangemode: 'nonnegative' })).toEqual([0, 1.5]);
    expect(run([span(-3, -3)], { rangemode: 'nonnegative' })).toEqual([0, 1]);
  });
});

describe('autorange: empty', () => {
  it('uses a valid axis.range', () => {
    expect(run([], { range: ['2', 5] })).toEqual([2, 5]);
    expect(run([], { range: [5, 2] })).toEqual([5, 2]);
  });

  it('falls back to Plotly defaults', () => {
    expect(run([])).toEqual([-1, 6]);
    expect(run([{ min: [], max: [pt(1)] }], { _id: 'y2' })).toEqual([-1, 4]);
    expect(run([], { range: [3, 3] })).toEqual([-1, 6]);
    expect(run([], { range: 'nope' })).toEqual([-1, 6]);
    expect(run([], {}, scaleOf('date'))).toEqual([EPOCH_2000, END_2000]);
    expect(run([], { autorange: 'reversed' }, scaleOf('date'))).toEqual([END_2000, EPOCH_2000]);
    expect(run([], { _id: 'y' }, scaleOf('log'))).toEqual([-1, 4]);
    expect(run([span(NaN, Infinity)])).toEqual([-1, 6]);
  });

  it('keeps the fixed end of a partial autorange', () => {
    expect(run([], { autorange: 'min', range: [null, 20] })).toEqual([13, 20]);
    expect(run([], { autorange: 'max', range: [0, null] })).toEqual([0, 7]);
  });
});

describe('autorange: reversal and partial ranges', () => {
  it('reverses on request or when axis.range is reversed', () => {
    expect(run([span(0, 10)], { autorange: 'reversed' })).toEqual([10, 0]);
    expect(run([span(0, 10)], { range: [5, 1] })).toEqual([10, 0]);
    expect(run([span(0, 10)], { range: [1, 5] })).toEqual([0, 10]);
  });

  it('autorange false returns a valid range, else autoranges', () => {
    expect(run([span(0, 10)], { autorange: false, range: [1, 2] })).toEqual([1, 2]);
    expect(run([span(0, 10)], { autorange: false })).toEqual([0, 10]);
  });

  it("'min' / 'max' autorange one end", () => {
    expect(run([span(0, 10)], { autorange: 'min', range: [null, 20] })).toEqual([0, 20]);
    // The padding of the autoranged end is solved against the fixed end.
    close(run([span(0, 10, 5, true)], { autorange: 'min', range: [null, 20] }), [
      (-25 * 20) / 375,
      20,
    ]);
    expect(run([span(0, 10)], { autorange: 'max', range: [-5, null] })).toEqual([-5, 10]);
    // A stored full range: 'min' keeps range[1], 'max' keeps range[0].
    expect(run([span(0, 10)], { autorange: 'min', range: [3, 12] })).toEqual([0, 12]);
    expect(run([span(0, 10)], { autorange: 'max', range: [-2, 3] })).toEqual([-2, 10]);
  });

  it("'min reversed' / 'max reversed'", () => {
    expect(run([span(0, 10)], { autorange: 'max reversed', range: [null, -5] })).toEqual([10, -5]);
    expect(run([span(0, 10)], { autorange: 'min reversed', range: [20, null] })).toEqual([20, 0]);
  });

  it('a partial autorange without a fixed end autoranges fully', () => {
    expect(run([span(0, 10)], { autorange: 'min', range: [null, null] })).toEqual([0, 10]);
    expect(run([span(0, 10)], { autorange: 'max' })).toEqual([0, 10]);
  });

  it('a single data value against a fixed end', () => {
    expect(run([span(5, 5)], { autorange: 'min', range: [null, 5] })).toEqual([4, 5]);
  });

  it('a fixed end beyond the data still gives a usable range', () => {
    expect(run([span(0, 10)], { autorange: 'min', range: [null, -5] })).toEqual([-6, -5]);
    expect(run([span(0, 10)], { autorange: 'max', range: [15, null] })).toEqual([15, 16]);
  });
});

describe('autorange: autorangeoptions and limits', () => {
  it('include extends the range (scalar or array, unpadded)', () => {
    expect(run([span(0, 10)], { autorangeoptions: { include: 20 } })).toEqual([0, 20]);
    expect(run([span(0, 10)], { autorangeoptions: { include: [-5, 3, 'x'] } })).toEqual([-5, 10]);
    expect(run([span(0, 10)], { autorangeoptions: { include: new Float64Array([12]) } })).toEqual([
      0, 12,
    ]);
  });

  it('include only extends autoranged ends', () => {
    expect(
      run([span(0, 10)], {
        autorange: 'min',
        range: [null, 12],
        autorangeoptions: { include: 30 },
      }),
    ).toEqual([0, 12]);
  });

  it('clipmin / clipmax bound the result', () => {
    expect(run([span(0, 10)], { autorangeoptions: { clipmin: 2 } })).toEqual([2, 10]);
    expect(run([span(0, 10)], { autorangeoptions: { clipmax: 8 } })).toEqual([0, 8]);
    expect(run([span(0, 10)], { autorangeoptions: { clipmin: -5, clipmax: 50 } })).toEqual([0, 10]);
    // Invalid pair (min ≥ max): both ignored.
    expect(run([span(0, 10)], { autorangeoptions: { clipmin: 5, clipmax: 3 } })).toEqual([0, 10]);
  });

  it('minallowed / maxallowed pin the ends', () => {
    expect(run([span(0, 10)], { autorangeoptions: { minallowed: 1 } })).toEqual([1, 10]);
    expect(run([span(0, 10)], { autorangeoptions: { maxallowed: 30, minallowed: -3 } })).toEqual([
      -3, 30,
    ]);
    expect(run([span(0, 10)], { autorangeoptions: { minallowed: 4, maxallowed: 4 } })).toEqual([
      0, 10,
    ]);
    // minallowed wins over clipmin.
    expect(run([span(0, 10)], { autorangeoptions: { minallowed: 1, clipmin: 3 } })).toEqual([
      1, 10,
    ]);
  });

  it('uses data units: log values and category names', () => {
    const log = run([span(1, 2)], { autorangeoptions: { include: 10000 } }, scaleOf('log'));
    close(log, [1, 4]);
    const cat = scaleOf('category', 400, { categories: ['a', 'b', 'c', 'd'] });
    expect(run([span(1, 2)], { autorangeoptions: { include: 'd', clipmin: 1.5 } }, cat)).toEqual([
      1.5, 3,
    ]);
    const date = scaleOf('date');
    const t0 = Date.UTC(2024, 0, 1);
    expect(
      run([span(t0, t0 + 10 * ONEDAY)], { autorangeoptions: { clipmin: '2024-01-03' } }, date),
    ).toEqual([t0 + 2 * ONEDAY, t0 + 10 * ONEDAY]);
  });

  it('top-level minallowed / maxallowed clamp both ends', () => {
    expect(run([span(0, 10)], { maxallowed: 5 })).toEqual([0, 5]);
    expect(run([span(0, 10)], { minallowed: 2, maxallowed: 8 })).toEqual([2, 8]);
    expect(run([span(0, 10)], { autorange: 'reversed', minallowed: 2 })).toEqual([10, 2]);
    // Crossed bounds are ignored.
    expect(run([span(0, 10)], { minallowed: 5, maxallowed: 3 })).toEqual([0, 10]);
    // Log: range units (exponents), as Plotly's limitRange.
    expect(run([span(0, 5)], { maxallowed: 3 }, scaleOf('log'))).toEqual([0, 3]);
  });

  it('repairs ranges that constraints collapse or cross', () => {
    expect(run([span(0, 10)], { minallowed: 20 })).toEqual([20, 21]);
    expect(run([span(0, 10)], { maxallowed: -5 })).toEqual([-6, -5]);
    expect(run([span(0, 10)], { autorangeoptions: { clipmin: 20 } })).toEqual([20, 21]);
    expect(run([span(0, 10)], { autorangeoptions: { clipmax: -5 } })).toEqual([-6, -5]);
    expect(run([span(0, 10)], { autorangeoptions: { clipmin: 20 }, maxallowed: 20.5 })).toEqual([
      19.5, 20.5,
    ]);
    expect(run([span(0, 10)], { autorangeoptions: { clipmax: -5 }, minallowed: -5.5 })).toEqual([
      -5.5, -4.5,
    ]);
    const t = Date.UTC(2024, 0, 1);
    expect(run([span(0, 10)], { minallowed: t }, scaleOf('date'))).toEqual([t, t + ONEDAY]);
  });

  it('never returns non-finite values', () => {
    const r = run([{ min: [pt(-1e308, 1)], max: [pt(1e308, 1)] }]);
    expect(r).toEqual([-1, 6]);
  });
});

describe('autorange: axis types', () => {
  it('log axes ignore non-positive data', () => {
    const s = scaleOf('log');
    const e = findExtremes(s, [-1, 0, 10, 1000]);
    close(autorange([e], s, axis()), [1, 3]);
  });

  it('date ranges', () => {
    const s = scaleOf('date');
    const e = findExtremes(s, ['2024-01-01', '2024-01-31']);
    expect(autorange([e], s, axis())).toEqual([Date.UTC(2024, 0, 1), Date.UTC(2024, 0, 31)]);
  });

  it('category ranges', () => {
    const s = scaleOf('category', 400, { categories: ['a', 'b', 'c'] });
    const e = findExtremes(s, ['a', 'c']);
    expect(autorange([e], s, axis())).toEqual([0, 2]);
  });
});

describe('autorange: properties', () => {
  const point = fc.record({
    l: fc.double({ min: -1e6, max: 1e6, noNaN: true }),
    padPx: fc.double({ min: 0, max: 60, noNaN: true }),
    extrapad: fc.boolean(),
  });
  const traces = fc.array(
    fc.record({
      min: fc.array(point, { minLength: 1, maxLength: 4 }),
      max: fc.array(point, { minLength: 1, maxLength: 4 }),
    }),
    { minLength: 1, maxLength: 4 },
  );

  it('contains every extreme value, finite with r0 < r1 (r0 > r1 when reversed)', () => {
    fc.assert(
      fc.property(
        traces,
        fc.integer({ min: 0, max: 2000 }),
        fc.constantFrom(true, 'reversed'),
        fc.constantFrom('normal', 'tozero', 'nonnegative'),
        (ext, length, mode, rangemode) => {
          // Consistent extremes: each trace's own span covers all of its points.
          const fixed = ext.map((e) => {
            const ls = [...e.min, ...e.max].map((p) => p.l);
            return {
              min: [...e.min, pt(Math.min(...ls))],
              max: [...e.max, pt(Math.max(...ls))],
            };
          });
          const r = autorange(
            fixed,
            scaleOf('linear', length),
            axis({ autorange: mode, rangemode }),
          );
          if (!r.every(Number.isFinite)) return false;
          const [lo, hi] = mode === 'reversed' ? [r[1], r[0]] : r;
          if (!(lo < hi)) return false;
          const all = fixed.flatMap((e) => [...e.min, ...e.max]).map((p) => p.l);
          if (rangemode === 'nonnegative' && lo < 0) return false;
          if (rangemode === 'tozero' && (lo > 0 || hi < 0)) return false;
          return all.every((v) => (rangemode === 'nonnegative' && v < 0) || (lo <= v && v <= hi));
        },
      ),
    );
  });

  it('uniform marker padding lands exactly at the axis ends', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -1e6, max: 1e6, noNaN: true }), { minLength: 2 }),
        fc.integer({ min: 100, max: 2000 }),
        fc.double({ min: 0, max: 20, noNaN: true }),
        fc.boolean(),
        (values, length, ppad, padded) => {
          const s = scaleOf('linear', length);
          const lo = Math.min(...values);
          const hi = Math.max(...values);
          fc.pre(hi - lo > 1e-9 * Math.max(1, Math.abs(lo), Math.abs(hi)));
          const [r0, r1] = autorange([findExtremes(s, values, { ppad, padded })], s, axis());
          const px = ppad + (padded ? 0.05 * length : 0);
          const m = length / (r1 - r0);
          const tol = 1e-6 * Math.max(1, px);
          return Math.abs((lo - r0) * m - px) < tol && Math.abs((r1 - hi) * m - px) < tol;
        },
      ),
    );
  });
});
