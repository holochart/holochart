import { describe, expect, it } from 'vitest';
import { fillGaps } from './contour-gaps.ts';

describe('fillGaps', () => {
  it('returns finite grids unchanged (as a copy)', () => {
    const z = [1, 2, 3, 4];
    const out = fillGaps(z, 2, 2);
    expect(Array.from(out)).toEqual(z);
    expect(out).not.toBe(z);
  });

  it('leaves all-empty grids empty', () => {
    const out = fillGaps([NaN, NaN, NaN], 3, 1);
    expect(Array.from(out).every(Number.isNaN)).toBe(true);
  });

  it('fills a lone interior gap with the neighbour average', () => {
    const z = [0, 1, 2, 1, NaN, 3, 2, 3, 4];
    const out = fillGaps(z, 3, 3);
    expect(out[4]).toBe(2);
    expect(Number.isNaN(z[4])).toBe(true); // input untouched
  });

  it('fills edge and corner gaps from their neighbours', () => {
    const out = fillGaps([NaN, 1, 2, 3, 4, 5], 3, 2);
    expect(out[0]).toBeCloseTo(2, 12); // (1 + 3) / 2
  });

  it('relaxes large gaps towards the harmonic solution', () => {
    // z = i on an 12×10 grid with a 6×5 hole reaching the top edge: z = i is harmonic with
    // zero y-derivative, so the fill should reproduce it.
    const nx = 12;
    const ny = 10;
    const z: number[] = [];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) z.push(i >= 3 && i < 9 && j >= 5 ? NaN : i);
    }
    const out = fillGaps(z, nx, ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        expect(Number.isFinite(out[j * nx + i])).toBe(true);
        expect(Math.abs(out[j * nx + i]! - i)).toBeLessThan(0.25);
      }
    }
  });

  it('treats non-number entries as gaps', () => {
    const z = [1, Infinity, 1, 1] as ArrayLike<number>;
    expect(Array.from(fillGaps(z, 2, 2))).toEqual([1, 1, 1, 1]);
  });
});
