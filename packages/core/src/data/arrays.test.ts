import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { dataArrayKind, isTypedArray, toFloat32Array, toFloat64Array } from './arrays.ts';

const JAN_1_2024 = Date.UTC(2024, 0, 1);

describe('isTypedArray', () => {
  it('accepts numeric typed arrays only', () => {
    const typed = [
      new Float32Array(1),
      new Float64Array(1),
      new Int8Array(1),
      new Int16Array(1),
      new Int32Array(1),
      new Uint8Array(1),
      new Uint8ClampedArray(1),
      new Uint16Array(1),
      new Uint32Array(1),
    ];
    for (const t of typed) expect(isTypedArray(t), t.constructor.name).toBe(true);
    for (const v of [[1], new DataView(new ArrayBuffer(1)), new BigInt64Array(1), null, {}]) {
      expect(isTypedArray(v)).toBe(false);
    }
  });
});

describe('dataArrayKind', () => {
  it('classifies columns', () => {
    expect(dataArrayKind([])).toBe('empty');
    expect(dataArrayKind([null, undefined, ''])).toBe('empty');
    expect(dataArrayKind(new Int16Array(4))).toBe('typed');
    expect(dataArrayKind([1, NaN, null, 3])).toBe('number');
    expect(dataArrayKind([new Date(), '2024-01-01', null])).toBe('date');
    expect(dataArrayKind(['a', '2024-01-01'])).toBe('string');
    expect(dataArrayKind(['1', '2'])).toBe('string');
    expect(dataArrayKind([1, 'a'])).toBe('mixed');
    expect(dataArrayKind([1, '2024-01-01'])).toBe('mixed');
    expect(dataArrayKind([true])).toBe('mixed');
    expect(dataArrayKind([{}])).toBe('mixed');
  });

  it('samples long arrays instead of scanning them', () => {
    const arr: unknown[] = Array.from({ length: 100_000 }, (_, i) => i);
    arr[1] = 'outlier';
    expect(dataArrayKind(arr)).toBe('number');
    // Proxy counts reads to prove sampling.
    let reads = 0;
    const counted = new Proxy(arr, {
      get(t, k, r) {
        if (typeof k === 'string' && /^\d+$/.test(k)) reads++;
        return Reflect.get(t, k, r) as unknown;
      },
    });
    dataArrayKind(counted);
    expect(reads).toBeLessThanOrEqual(1001);
  });
});

describe('toFloat64Array', () => {
  it('returns a Float64Array input unchanged (zero-copy)', () => {
    const f = new Float64Array([1, 2, 3]);
    expect(toFloat64Array(f)).toBe(f);
    expect(toFloat64Array(f, { dates: true })).toBe(f);
  });

  it('converts other typed arrays natively', () => {
    const out = toFloat64Array(new Int8Array([-1, 2]));
    expect(out).toBeInstanceOf(Float64Array);
    expect([...out]).toEqual([-1, 2]);
    expect([...toFloat64Array(new Uint32Array([4_000_000_000]))]).toEqual([4_000_000_000]);
    expect([...toFloat64Array(new BigInt64Array([5n, -6n]))]).toEqual([5, -6]);
  });

  it('parses numeric strings and turns non-numbers into NaN', () => {
    const out = toFloat64Array([
      1,
      ' 2 ',
      '1e3',
      '',
      '  ',
      'abc',
      'Infinity',
      null,
      undefined,
      true,
    ]);
    expect([...out]).toEqual([1, 2, 1000, NaN, NaN, NaN, NaN, NaN, NaN, NaN]);
  });

  it('converts dates only when asked to', () => {
    const input = [new Date(JAN_1_2024), '2024-01-01', '2024-01-01 06:00', 5];
    expect([...toFloat64Array(input)]).toEqual([NaN, NaN, NaN, 5]);
    expect([...toFloat64Array(input, { dates: true })]).toEqual([
      JAN_1_2024,
      JAN_1_2024,
      JAN_1_2024 + 6 * 3_600_000,
      5,
    ]);
    expect([...toFloat64Array([new Date(NaN), '2023-02-29'], { dates: true })]).toEqual([NaN, NaN]);
    expect([...toFloat64Array(['2024-01-01'], { dates: true, calendar: 'chinese' })]).toEqual([
      NaN,
    ]);
  });

  it('round-trips numbers verbatim', () => {
    fc.assert(
      fc.property(fc.array(fc.double()), (nums) => {
        const out = toFloat64Array(nums);
        expect(out.length).toBe(nums.length);
        nums.forEach((n, i) => expect(Object.is(out[i], n)).toBe(true));
      }),
    );
  });

  it('round-trips numbers written as strings', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ noNaN: true, noDefaultInfinity: true })), (nums) => {
        const out = toFloat64Array(nums.map(String));
        nums.forEach((n, i) => expect(out[i]).toBe(n === 0 ? 0 : n));
      }),
    );
  });

  it('never throws and always returns the input length', () => {
    fc.assert(
      fc.property(fc.array(fc.anything()), fc.boolean(), (arr, dates) => {
        expect(toFloat64Array(arr, { dates }).length).toBe(arr.length);
      }),
    );
  });
});

describe('toFloat32Array', () => {
  it('returns a Float32Array input unchanged when no origin is given', () => {
    const f = new Float32Array([1, 2]);
    expect(toFloat32Array(f)).toBe(f);
    expect(toFloat32Array(f, { origin: 0 })).toBe(f);
    const shifted = toFloat32Array(f, { origin: 1 });
    expect(shifted).not.toBe(f);
    expect([...shifted]).toEqual([0, 1]);
    expect([...f]).toEqual([1, 2]);
  });

  it('subtracts the origin in double precision (relative-to-center)', () => {
    const base = Date.UTC(2026, 5, 1, 12);
    const ms = new Float64Array([base, base + 1, base + 999]);
    // Without an origin float32 cannot tell these apart.
    const naive = toFloat32Array(ms);
    expect(naive[0]).toBe(naive[1]);
    expect([...toFloat32Array(ms, { origin: base })]).toEqual([0, 1, 999]);
    expect([...toFloat32Array(['2026-06-01 12:00:00.001'], { dates: true, origin: base })]).toEqual(
      [1],
    );
  });

  it('converts plain arrays with the same element rules', () => {
    expect([...toFloat32Array([1, '2', null, 'x'])]).toEqual([1, 2, NaN, NaN]);
    expect([...toFloat32Array(new Int32Array([7]))]).toEqual([7]);
  });
});
