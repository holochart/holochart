import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CONSTRAINT_OPERATIONS,
  CONSTRAINT_REDUCTION,
  constraintHasFill,
  constraintLevels,
  constraintRegion,
  constraintValue,
  isIntervalOperation,
  reverseRegion,
  satisfiesConstraint,
  type ConstraintOperation,
} from './contour-constraint.ts';
import { gridBoundary, levelRegion, regionArea, type ContourRegion } from './contour-fill.ts';
import { marchingSquares, type ContourGrid } from './contour-march.ts';

/** Winding number of a region's rings around (px, py). */
function winding(r: ContourRegion, px: number, py: number): number {
  let w = 0;
  for (let q = 0; q < r.rings.length; q++) {
    const a = r.rings[q]!;
    const b = q + 1 < r.rings.length ? r.rings[q + 1]! : r.x.length;
    for (let k = a; k < b; k++) {
      const k1 = k + 1 < b ? k + 1 : a;
      const x0 = r.x[k]!;
      const y0 = r.y[k]!;
      const x1 = r.x[k1]!;
      const y1 = r.y[k1]!;
      const cross = (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0);
      if (y0 <= py && y1 > py && cross > 0) w++;
      else if (y0 > py && y1 <= py && cross < 0) w--;
    }
  }
  return w;
}

/** z = x on an n × 3 grid: every level is a vertical line. */
function ramp(n: number): ContourGrid {
  const z: number[] = [];
  for (let j = 0; j < 3; j++) for (let i = 0; i < n; i++) z.push(i);
  return { z, nx: n, ny: 3 };
}

function rectOf(g: ContourGrid): ContourRegion {
  const b = gridBoundary(g.nx, g.ny);
  return { x: b.x, y: b.y, rings: Uint32Array.of(0) };
}

function shaded(g: ContourGrid, op: ConstraintOperation, value: unknown) {
  const regions = constraintLevels(op, value).map((l) => levelRegion(marchingSquares(g, l), g, l));
  return constraintRegion(op, regions, rectOf(g));
}

describe('constraint values and levels (Plotly constraint_defaults / constraint_mapping)', () => {
  it('reduces every operation to five', () => {
    expect(new Set(Object.values(CONSTRAINT_REDUCTION))).toEqual(
      new Set(['=', '<', '>', '[]', '][']),
    );
    for (const op of CONSTRAINT_OPERATIONS) expect(CONSTRAINT_REDUCTION[op]).toBeDefined();
    expect(CONSTRAINT_REDUCTION['<=']).toBe('<');
    expect(CONSTRAINT_REDUCTION['>=']).toBe('>');
    expect(CONSTRAINT_REDUCTION['()']).toBe('[]');
    expect(CONSTRAINT_REDUCTION[')(']).toBe('][');
    expect(isIntervalOperation('[)')).toBe(true);
    expect(isIntervalOperation('<')).toBe(false);
    expect(constraintHasFill('=')).toBe(false);
    expect(constraintHasFill('>=')).toBe(true);
  });

  it('coerces values: numbers for comparisons, pairs for intervals', () => {
    expect(constraintValue('<', 3)).toBe(3);
    expect(constraintValue('<', '2.5')).toBe(2.5);
    expect(constraintValue('>=', [4, 9])).toBe(4);
    expect(constraintValue('=', 'nope')).toBe(0);
    expect(constraintValue('[]', [5, 2])).toEqual([5, 2]);
    expect(constraintValue('[]', 3)).toEqual([3, 4]);
    expect(constraintValue('][', [7])).toEqual([7, 8]);
    expect(constraintValue('()', null)).toEqual([0, 1]);
    expect(constraintValue('](', Float64Array.of(1, 2))).toEqual([1, 2]);
  });

  it('lists one level for comparisons and the sorted ends for intervals', () => {
    expect(constraintLevels('>', 2)).toEqual([2]);
    expect(constraintLevels('[]', [5, 2])).toEqual([2, 5]);
    expect(constraintLevels(')[', [1, 3])).toEqual([1, 3]);
  });

  it('tests values against a constraint', () => {
    expect(satisfiesConstraint('<', 2, 1)).toBe(true);
    expect(satisfiesConstraint('<', 2, 2)).toBe(false);
    expect(satisfiesConstraint('>=', 2, 2)).toBe(true);
    expect(satisfiesConstraint('[]', [1, 3], 2)).toBe(true);
    expect(satisfiesConstraint('[]', [1, 3], 4)).toBe(false);
    expect(satisfiesConstraint('][', [1, 3], 4)).toBe(true);
    expect(satisfiesConstraint('=', 1, 1)).toBe(true);
  });
});

describe('constraint regions (Plotly convert_to_constraints / close_boundaries)', () => {
  // On z = x (x from 0 to 8, height 2) the shaded areas are exact.
  const g = ramp(9);

  it('shades z ≥ v for > and its complement for <', () => {
    expect(regionArea(shaded(g, '>', 2.5)!)).toBeCloseTo((8 - 2.5) * 2, 9);
    expect(regionArea(shaded(g, '<=', 2.5)!)).toBeCloseTo(2.5 * 2, 9);
    const below = shaded(g, '<', 2.5)!;
    expect(winding(below, 1, 1)).toBe(1);
    expect(winding(below, 4, 1)).toBe(0);
  });

  it('shades inside an interval for [] and outside for ][', () => {
    const inside = shaded(g, '[]', [6, 2])!;
    expect(regionArea(inside)).toBeCloseTo(4 * 2, 9);
    expect(winding(inside, 1, 1)).toBe(0);
    expect(winding(inside, 3, 1)).toBe(1);
    expect(winding(inside, 7, 1)).toBe(0);
    const outside = shaded(g, '](', [2, 6])!;
    expect(regionArea(outside)).toBeCloseTo((2 + 2) * 2, 9);
    expect(winding(outside, 1, 1)).toBe(1);
    expect(winding(outside, 3, 1)).toBe(0);
    expect(winding(outside, 7, 1)).toBe(1);
  });

  it('shades nothing for =, and handles values outside the data', () => {
    expect(shaded(g, '=', 3)).toBeUndefined();
    expect(regionArea(shaded(g, '>', -1)!)).toBeCloseTo(16, 9);
    expect(regionArea(shaded(g, '>', 99)!)).toBeCloseTo(0, 9);
    expect(regionArea(shaded(g, '<', 99)!)).toBeCloseTo(16, 9);
    expect(regionArea(shaded(g, '[]', [-5, 99])!)).toBeCloseTo(16, 9);
    expect(regionArea(shaded(g, '][', [-5, 99])!)).toBeCloseTo(0, 9);
  });

  it('reverses rings', () => {
    const r: ContourRegion = {
      x: Float64Array.of(0, 1, 1, 5, 6, 6),
      y: Float64Array.of(0, 0, 1, 0, 0, 1),
      rings: Uint32Array.of(0, 3),
    };
    const rev = reverseRegion(r);
    expect(Array.from(rev.x)).toEqual([1, 1, 0, 6, 6, 5]);
    expect(regionArea(rev)).toBeCloseTo(-regionArea(r), 12);
  });

  it('property: complementary constraints partition the grid (windings 0 or 1)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }),
        fc.integer({ min: 2, max: 6 }),
        fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 36, maxLength: 36 }),
        fc.integer({ min: 0, max: 4 }),
        fc.integer({ min: 0, max: 4 }),
        (nx, ny, values, a, b) => {
          const grid: ContourGrid = { z: values.slice(0, nx * ny), nx, ny };
          const total = (nx - 1) * (ny - 1);
          const lo = Math.min(a, b) + 0.5;
          const hi = Math.max(a, b) + 0.5;
          const above = regionArea(shaded(grid, '>', lo)!);
          const below = regionArea(shaded(grid, '<', lo)!);
          expect(above + below).toBeCloseTo(total, 9);
          const inside = shaded(grid, '[]', [lo, hi])!;
          const outside = shaded(grid, '][', [lo, hi])!;
          expect(regionArea(inside) + regionArea(outside)).toBeCloseTo(total, 9);
          for (const [px, py] of [
            [0.37, 0.41],
            [(nx - 1) * 0.63, (ny - 1) * 0.29],
            [(nx - 1) * 0.5 + 0.01, (ny - 1) * 0.5 + 0.02],
          ] as const) {
            const wi = winding(inside, px, py);
            const wo = winding(outside, px, py);
            expect(wi === 0 || wi === 1).toBe(true);
            expect(wi + wo).toBe(1);
          }
        },
      ),
    );
  });
});
