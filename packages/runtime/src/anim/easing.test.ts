import { EASINGS } from '@mk7s/holochart-core';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { easing } from './easing.ts';

/**
 * Plotly passes its easing names to d3 v3's `d3.ease`: these are d3 v3.5.17's formulas
 * (`src/interpolate/ease.js`), worked out at sample points.
 */
describe('easing (d3 v3 d3.ease)', () => {
  const cases: [string, number, number][] = [
    ['linear', 0.3, 0.3],
    ['quad-in', 0.5, 0.25],
    ['quad-out', 0.5, 0.75],
    ['quad-in-out', 0.25, 0.125],
    ['quad-in-out', 0.75, 0.875],
    ['cubic-in', 0.5, 0.125],
    ['cubic-out', 0.5, 0.875],
    ['cubic-in-out', 0.25, 0.0625],
    ['sin-in', 0.5, 1 - Math.cos(Math.PI / 4)],
    ['sin-out', 0.5, Math.sin(Math.PI / 4)],
    ['exp-in', 0.5, 2 ** -5],
    ['exp-out', 0.5, 1 - 2 ** -5],
    ['circle-in', 0.5, 1 - Math.sqrt(0.75)],
    ['circle-out', 0.5, Math.sqrt(0.75)],
    ['back-in', 0.5, 0.25 * (2.70158 * 0.5 - 1.70158)],
    ['back-out', 0.5, 1 - 0.25 * (2.70158 * 0.5 - 1.70158)],
    // d3 v3's elastic and bounce bases are out-shaped already (a d3 v3 quirk Plotly inherits).
    ['elastic-in', 0.5, 1 + 2 ** -5 * Math.sin(((0.5 - 0.1125) * 2 * Math.PI) / 0.45)],
    ['elastic-out', 0.5, -(2 ** -5) * Math.sin(((0.5 - 0.1125) * 2 * Math.PI) / 0.45)],
    ['bounce-in', 0.5, 7.5625 * (0.5 - 1.5 / 2.75) ** 2 + 0.75],
    ['bounce-in', 0.2, 7.5625 * 0.04],
    ['bounce-in', 0.8, 7.5625 * (0.8 - 2.25 / 2.75) ** 2 + 0.9375],
    ['bounce-in', 0.95, 7.5625 * (0.95 - 2.625 / 2.75) ** 2 + 0.984375],
    ['bounce-out', 0.5, 1 - (7.5625 * (0.5 - 1.5 / 2.75) ** 2 + 0.75)],
    ['bounce-in-out', 0.25, 0.5 * (7.5625 * (0.5 - 1.5 / 2.75) ** 2 + 0.75)],
  ];

  it.each(cases)('%s(%f)', (name, t, expected) => {
    expect(easing(name)(t)).toBeCloseTo(expected, 12);
  });

  it('a bare name is -in, an unknown one linear; -out-in reflects the reverse', () => {
    expect(easing('cubic')(0.5)).toBe(0.125);
    expect(easing('elastic')(0.3)).toBe(easing('elastic-in')(0.3));
    expect(easing('wobble')(0.3)).toBeCloseTo(0.3, 15);
    expect(easing('quad-out-in')(0.25)).toBeCloseTo(0.5 * (1 - 0.25), 12);
  });

  it('clamps: 0 at t ≤ 0 and 1 at t ≥ 1, even where the formula would not', () => {
    for (const name of EASINGS) {
      const f = easing(name);
      expect([f(-1), f(0), f(1), f(2)]).toEqual([0, 0, 1, 1]);
    }
    // exp is 2^-10 at t = 0 before clamping.
    expect(easing('exp-in')(1e-9)).toBeCloseTo(2 ** -10, 6);
  });

  it('-out mirrors -in; -in-out is point-symmetric around (0.5, 0.5)', () => {
    const base = fc.constantFrom(
      'linear',
      'quad',
      'cubic',
      'sin',
      'exp',
      'circle',
      'elastic',
      'back',
      'bounce',
    );
    const t = fc.double({ min: 0.001, max: 0.999, noNaN: true });
    fc.assert(
      fc.property(base, t, (name, x) => {
        expect(easing(`${name}-out`)(x)).toBeCloseTo(1 - easing(`${name}-in`)(1 - x), 9);
        const io = easing(`${name}-in-out`);
        expect(io(x) + io(1 - x)).toBeCloseTo(1, 9);
      }),
    );
  });
});
