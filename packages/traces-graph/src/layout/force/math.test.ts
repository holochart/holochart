import { describe, expect, it } from 'vitest';
import { cubeRoot, Lcg, nthRoot } from './math.ts';

describe('force layout: deterministic numerics', () => {
  it('Lcg gives the same sequence for the same seed, in [0, 1)', () => {
    const a = new Lcg(42);
    const b = new Lcg(42);
    const values = Array.from({ length: 1000 }, () => a.next());
    expect(Array.from({ length: 1000 }, () => b.next())).toEqual(values);
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    // Spread over the range, not stuck.
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
    expect(new Lcg(43).next()).not.toBe(new Lcg(42).next());
  });

  it('Lcg takes any seed: fractions, negatives and non-numbers', () => {
    for (const seed of [0, -1, 1.5, 2 ** 40, NaN, Infinity]) {
      const v = new Lcg(seed).next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(new Lcg(NaN).next()).toBe(new Lcg(1).next());
  });

  it('jiggle is tiny and never zero', () => {
    const rng = new Lcg(7);
    for (let k = 0; k < 10000; k++) {
      const j = rng.jiggle();
      expect(j).not.toBe(0);
      expect(Math.abs(j)).toBeLessThanOrEqual(5e-7);
    }
  });

  it('nthRoot matches Math.pow to the last bits', () => {
    for (const [a, n] of [
      [0.001, 300],
      [0.001, 1],
      [0.001, 2],
      [0.001, 50],
      [0.001, 5000],
      [0.5, 7],
      [1, 300],
      [1e-12, 90],
    ] as const) {
      const root = nthRoot(a, n);
      expect(Math.abs(root - Math.pow(a, 1 / n))).toBeLessThanOrEqual(4 * Number.EPSILON);
    }
  });

  it('cubeRoot matches Math.cbrt', () => {
    for (const v of [0.5, 1, 2, 8, 27, 1000.5, 1e6, 1e12, 1e-9]) {
      expect(Math.abs(cubeRoot(v) / Math.cbrt(v) - 1)).toBeLessThanOrEqual(4 * Number.EPSILON);
    }
    expect(cubeRoot(0)).toBe(0);
    expect(cubeRoot(-8)).toBe(0);
    expect(cubeRoot(NaN)).toBe(0);
  });
});
