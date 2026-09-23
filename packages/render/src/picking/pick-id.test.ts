import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MAX_PICK_ID,
  PickIdLayout,
  decodePickId,
  encodePickId,
  type PickIdRange,
} from './pick-id.ts';

/** Simulate the GPU's float -> unorm8 conversion, rounding or truncating (both are allowed). */
function toBytes(
  rgba: ArrayLike<number>,
  convert: (v: number) => number,
  offset = 0,
): [number, number, number, number] {
  return [0, 1, 2, 3].map((c) =>
    convert(Math.min(1, Math.max(0, rgba[offset + c] as number)) * 255),
  ) as [number, number, number, number];
}

describe('pick id encoding', () => {
  it.each([0, 1, 255, 256, 65535, 2 ** 24, 2 ** 31, MAX_PICK_ID])('round-trips id %i', (id) => {
    const rgba = encodePickId(id);
    expect(rgba).toBeInstanceOf(Float32Array);
    expect(rgba.length).toBe(4);
    for (const c of rgba) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
    expect(decodePickId(...toBytes(rgba, Math.round))).toBe(id);
  });

  it('round-trips every id under rounding AND truncating unorm conversion', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_PICK_ID }), (id) => {
        // Float32 storage, as a uniform or GPU register would hold it.
        const rgba = encodePickId(id, new Float32Array(4));
        expect(decodePickId(...toBytes(rgba, Math.round))).toBe(id);
        expect(decodePickId(...toBytes(rgba, Math.floor))).toBe(id);
      }),
      { numRuns: 2000 },
    );
  });

  it('decodes bytes with the top bit set (no sign issues)', () => {
    expect(decodePickId(255, 255, 255, 255)).toBe(MAX_PICK_ID);
    expect(decodePickId(128, 0, 0, 1)).toBe(2 ** 31);
  });

  it('writes into a provided array at an offset', () => {
    const out = [9, 9, 9, 9, 9, 9];
    expect(encodePickId(65535, out, 2)).toBe(out);
    expect(out.slice(0, 2)).toEqual([9, 9]);
    expect(decodePickId(...toBytes(out, Math.round, 2))).toBe(65535);
  });

  it('decodes the cleared background as no hit', () => {
    expect(decodePickId(0, 0, 0, 0)).toBe(-1);
  });

  it('rejects ids outside 32 bits', () => {
    expect(MAX_PICK_ID).toBe(2 ** 32 - 2);
    expect(() => encodePickId(-1)).toThrow(RangeError);
    expect(() => encodePickId(2 ** 32 - 1)).toThrow(RangeError);
    expect(() => encodePickId(1.5)).toThrow(RangeError);
    expect(() => encodePickId(NaN)).toThrow(RangeError);
  });
});

describe('PickIdLayout', () => {
  const range = (): PickIdRange<string> => ({ base: 0, size: 0, entry: null });

  it('allocates contiguous ranges and looks ids up', () => {
    const layout = new PickIdLayout<string>();
    expect(layout.allocate('a', 3)).toBe(0);
    expect(layout.allocate('b', 1)).toBe(3);
    expect(layout.allocate('c', 5)).toBe(4);
    expect(layout.count).toBe(3);
    expect(layout.total).toBe(9);
    const r = range();
    expect(layout.lookup(0, r)).toBe(true);
    expect(r).toEqual({ base: 0, size: 3, entry: 'a' });
    expect(layout.lookup(3, r)).toBe(true);
    expect(r.entry).toBe('b');
    expect(layout.lookup(8, r)).toBe(true);
    expect(r).toEqual({ base: 4, size: 5, entry: 'c' });
    expect(layout.lookup(9, r)).toBe(false);
    expect(layout.lookup(-1, r)).toBe(false);
    expect(layout.lookup(NaN, r)).toBe(false);
  });

  it('skips zero-sized ranges', () => {
    const layout = new PickIdLayout<string>();
    layout.allocate('empty0', 0);
    layout.allocate('a', 2);
    layout.allocate('empty1', 0);
    layout.allocate('empty2', 0);
    layout.allocate('b', 2);
    layout.allocate('tail', 0);
    const r = range();
    const owners = [0, 1, 2, 3].map((id) => (layout.lookup(id, r) ? r.entry : null));
    expect(owners).toEqual(['a', 'a', 'b', 'b']);
    expect(layout.lookup(4, r)).toBe(false);
  });

  it('reset forgets ranges and entries', () => {
    const layout = new PickIdLayout<object>();
    layout.allocate({}, 10);
    layout.reset();
    expect(layout.count).toBe(0);
    expect(layout.total).toBe(0);
    expect(layout.lookup(0, { base: 0, size: 0, entry: null })).toBe(false);
    expect(layout.allocate({}, 1)).toBe(0);
  });

  it('throws when the id space is exhausted', () => {
    const layout = new PickIdLayout<string>();
    layout.allocate('big', MAX_PICK_ID);
    layout.allocate('last', 1);
    expect(() => layout.allocate('over', 1)).toThrow(RangeError);
  });

  it('lookup agrees with a linear scan', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 20 }), { maxLength: 30 }),
        fc.integer({ min: -2, max: 400 }),
        (sizes, id) => {
          const layout = new PickIdLayout<number>();
          sizes.forEach((s, i) => layout.allocate(i, s));
          let expected: number | null = null;
          let base = 0;
          sizes.forEach((s, i) => {
            if (id >= base && id < base + s) expected = i;
            base += s;
          });
          const r: PickIdRange<number> = { base: 0, size: 0, entry: null };
          const found = layout.lookup(id, r);
          expect(found ? r.entry : null).toBe(expected);
        },
      ),
      { numRuns: 300 },
    );
  });
});
