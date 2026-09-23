import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { MAX_PICK_ID, createGpuPicker, decodePickId, encodePickId } from './gpu-picking.ts';

/** Simulate the GPU's float -> unorm8 conversion on write. */
function toBytes(rgb: ArrayLike<number>, offset = 0): [number, number, number] {
  return [0, 1, 2].map((c) => Math.round((rgb[offset + c] as number) * 255)) as [
    number,
    number,
    number,
  ];
}

describe('pick id encoding', () => {
  it.each([0, 1, 255, 65535, 2 ** 24 - 2])('round-trips id %i', (id) => {
    const rgb = encodePickId(id);
    expect(rgb).toBeInstanceOf(Float32Array);
    for (const c of rgb) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
    expect(decodePickId(...toBytes(rgb))).toBe(id);
  });

  it('writes into a provided array at an offset', () => {
    const out = [9, 9, 9, 9, 9];
    expect(encodePickId(65535, out, 2)).toBe(out);
    expect(out.slice(0, 2)).toEqual([9, 9]);
    expect(decodePickId(...toBytes(out, 2))).toBe(65535);
  });

  it('decodes the cleared background as no hit', () => {
    expect(decodePickId(0, 0, 0)).toBe(-1);
  });

  it('rejects ids outside 24 bits', () => {
    expect(MAX_PICK_ID).toBe(2 ** 24 - 2);
    expect(() => encodePickId(-1)).toThrow(RangeError);
    expect(() => encodePickId(2 ** 24 - 1)).toThrow(RangeError);
    expect(() => encodePickId(1.5)).toThrow(RangeError);
  });
});

describe('createGpuPicker (stub)', () => {
  it('tracks registrations and rejects pick', async () => {
    const picker = createGpuPicker();
    picker.register(1, new Object3D(), 0);
    picker.unregister(1);
    expect(() => picker.register(-1, new Object3D(), 0)).toThrow(RangeError);
    await expect(picker.pick({ x: 10, y: 10, radius: 4 })).rejects.toThrow(/not implemented/);
    picker.dispose();
  });
});
