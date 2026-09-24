import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  gridBoundary,
  levelRegion,
  perimeterParam,
  regionArea,
  type ContourRegion,
} from './contour-fill.ts';
import { marchingSquares, type ContourGrid } from './contour-march.ts';

function grid(rows: number[][]): ContourGrid {
  return { z: rows.flat(), nx: rows[0]!.length, ny: rows.length };
}

function region(g: ContourGrid, level: number): ContourRegion {
  return levelRegion(marchingSquares(g, level), g, level);
}

function ringCount(r: ContourRegion): number {
  return r.rings.length;
}

function ringAreas(r: ContourRegion): number[] {
  const out: number[] = [];
  for (let k = 0; k < r.rings.length; k++) {
    const a = r.rings[k]!;
    const b = k + 1 < r.rings.length ? r.rings[k + 1]! : r.x.length;
    out.push(
      regionArea({ x: r.x.subarray(a, b), y: r.y.subarray(a, b), rings: Uint32Array.of(0) }),
    );
  }
  return out;
}

/** Nonzero winding number of (px, py) over all rings. */
function winding(r: ContourRegion, px: number, py: number): number {
  let wn = 0;
  for (let k = 0; k < r.rings.length; k++) {
    const a = r.rings[k]!;
    const b = k + 1 < r.rings.length ? r.rings[k + 1]! : r.x.length;
    for (let v = a; v < b; v++) {
      const w = v + 1 < b ? v + 1 : a;
      const x0 = r.x[v]!;
      const y0 = r.y[v]!;
      const x1 = r.x[w]!;
      const y1 = r.y[w]!;
      const cross = (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0);
      if (y0 <= py) {
        if (y1 > py && cross > 0) wn++;
      } else if (y1 <= py && cross < 0) wn--;
    }
  }
  return wn;
}

/** Bilinear interpolation of the grid at (x, y). */
function bilinear(g: ContourGrid, x: number, y: number): number {
  const i = Math.min(Math.floor(x), g.nx - 2);
  const j = Math.min(Math.floor(y), g.ny - 2);
  const u = x - i;
  const v = y - j;
  const z = (ii: number, jj: number) => g.z[jj * g.nx + ii]!;
  return (
    (1 - u) * (1 - v) * z(i, j) +
    u * (1 - v) * z(i + 1, j) +
    (1 - u) * v * z(i, j + 1) +
    u * v * z(i + 1, j + 1)
  );
}

describe('levelRegion', () => {
  it('uses the ring around a peak as is', () => {
    const r = region(
      grid([
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 0],
      ]),
      0.5,
    );
    expect(ringCount(r)).toBe(1);
    expect(regionArea(r)).toBeCloseTo(0.5, 12);
  });

  it('adds the boundary rectangle around a valley hole (clockwise)', () => {
    const r = region(
      grid([
        [1, 1, 1],
        [1, 0, 1],
        [1, 1, 1],
      ]),
      0.5,
    );
    expect(ringCount(r)).toBe(2);
    const areas = ringAreas(r).sort((a, b) => a - b);
    expect(areas[0]).toBeCloseTo(-0.5, 12);
    expect(areas[1]).toBeCloseTo(4, 12);
    expect(regionArea(r)).toBeCloseTo(3.5, 12);
    expect(winding(r, 1, 1)).toBe(0);
    expect(winding(r, 0.2, 0.2)).toBe(1);
  });

  it('adds the whole boundary when everything is above, nothing when below', () => {
    const flat = grid([
      [2, 2],
      [2, 2],
    ]);
    expect(regionArea(region(flat, 1))).toBe(1);
    expect(regionArea(region(flat, 2))).toBe(1);
    expect(ringCount(region(flat, 3))).toBe(0);
    const holed: ContourGrid = { z: [NaN, 2, 2, 2], nx: 2, ny: 2 };
    expect(regionArea(region(holed, 1))).toBe(1);
  });

  it('closes an open path along the boundary counter-clockwise', () => {
    const r = region(
      grid([
        [0, 1, 2, 3],
        [0, 1, 2, 3],
        [0, 1, 2, 3],
      ]),
      1.5,
    );
    expect(ringCount(r)).toBe(1);
    expect(Array.from(r.x)).toEqual([1.5, 1.5, 1.5, 3, 3]);
    expect(Array.from(r.y)).toEqual([2, 1, 0, 0, 2]);
    expect(regionArea(r)).toBeCloseTo(3, 12);
  });

  it('walks round boundary corners', () => {
    // z = i + j: level 0.5 cuts off the (0, 0) corner.
    const g = grid([
      [0, 1, 2],
      [1, 2, 3],
      [2, 3, 4],
    ]);
    const r = region(g, 0.5);
    expect(ringCount(r)).toBe(1);
    expect(r.x).toHaveLength(5);
    expect(regionArea(r)).toBeCloseTo(4 - 0.125, 12);
    // Below corner cut off at the top right instead: only corners before it are walked.
    expect(regionArea(region(g, 3.5))).toBeCloseTo(0.125, 12);
  });

  it('joins paths that end exactly on corners', () => {
    const g = grid([
      [0, 1, 2],
      [1, 2, 3],
      [2, 3, 4],
    ]);
    // The anti-diagonal is exactly at level 2: path (0, 2) → (1, 1) → (2, 0).
    const r = region(g, 2);
    expect(ringCount(r)).toBe(1);
    expect(Array.from(r.x)).toEqual([0, 1, 2, 2]);
    expect(Array.from(r.y)).toEqual([2, 1, 0, 2]);
    expect(regionArea(r)).toBeCloseTo(2, 12);
    expect(regionArea(region(g, 0))).toBe(4);
    expect(ringCount(region(g, 4))).toBe(0);
  });

  it('pairs several open paths ending on the same edges', () => {
    const ridges = grid([
      [0, 1, 0, 1, 0],
      [0, 1, 0, 1, 0],
    ]);
    const r = region(ridges, 0.5);
    expect(ringCount(r)).toBe(2);
    expect(ringAreas(r).map((a) => +a.toFixed(12))).toEqual([1, 1]);
    const valleys = grid([
      [1, 0, 1, 0, 1],
      [1, 0, 1, 0, 1],
    ]);
    const v = region(valleys, 0.5);
    expect(ringCount(v)).toBe(3);
    expect(regionArea(v)).toBeCloseTo(2, 12);
    expect(winding(v, 0.25, 0.5)).toBe(1);
    expect(winding(v, 1, 0.5)).toBe(0);
    expect(winding(v, 2, 0.5)).toBe(1);
    expect(winding(v, 3.75, 0.5)).toBe(1);
  });

  it('covers the above-level area of smooth fields under the nonzero rule', () => {
    const nx = 31;
    const ny = 23;
    const f = (x: number, y: number) =>
      Math.sin(x * 0.35) * Math.cos(y * 0.4) + 0.3 * Math.sin((x + y) * 0.2);
    const z: number[] = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z.push(f(i, j));
    const g = { z, nx, ny };
    const total = (nx - 1) * (ny - 1);
    let prev = Infinity;
    for (const level of [-1, -0.6, -0.2, 0, 0.3, 0.7, 1.1]) {
      const r = region(g, level);
      // Area against a fine sampling of the bilinear field.
      const n = 4;
      let inside = 0;
      let agree = 0;
      let count = 0;
      for (let j = 0; j < (ny - 1) * n; j++) {
        for (let i = 0; i < (nx - 1) * n; i++) {
          const x = (i + 0.5) / n;
          const y = (j + 0.5) / n;
          const v = bilinear(g, x, y);
          const wn = winding(r, x, y);
          expect(wn === 0 || wn === 1).toBe(true);
          if (v >= level) inside++;
          count++;
          if (Math.abs(v - level) > 0.05) {
            agree += (wn === 1) === v >= level ? 1 : 0;
          } else agree++;
        }
      }
      expect(agree).toBe(count);
      const area = regionArea(r);
      expect(Math.abs(area - (inside / count) * total)).toBeLessThan(0.01 * total);
      expect(area).toBeLessThanOrEqual(prev + 1e-9);
      prev = area;
    }
  });

  it('property: interior grid points are inside exactly when above the level', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 7 }),
        fc.integer({ min: 2, max: 7 }),
        fc.array(fc.integer({ min: 0, max: 4 }), { minLength: 49, maxLength: 49 }),
        fc.integer({ min: 0, max: 3 }),
        (nx, ny, values, lv) => {
          const g = { z: values.slice(0, nx * ny), nx, ny };
          const level = lv + 0.5;
          const r = region(g, level);
          const area = regionArea(r);
          expect(area).toBeGreaterThanOrEqual(-1e-9);
          expect(area).toBeLessThanOrEqual((nx - 1) * (ny - 1) + 1e-9);
          for (let j = 1; j < ny - 1; j++) {
            for (let i = 1; i < nx - 1; i++) {
              const above = g.z[j * nx + i]! >= level;
              expect(winding(r, i, j)).toBe(above ? 1 : 0);
            }
          }
          // No overlapping or inverted coverage anywhere.
          for (let j = 0; j < ny - 1; j++) {
            for (let i = 0; i < nx - 1; i++) {
              for (const [u, v] of [
                [0.5, 0.5],
                [0.1, 0.3],
                [0.8, 0.9],
              ] as const) {
                const wn = winding(r, i + u, j + v);
                expect(wn === 0 || wn === 1).toBe(true);
              }
            }
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('boundary helpers', () => {
  it('gridBoundary is a counter-clockwise rectangle', () => {
    const b = gridBoundary(4, 3);
    expect(Array.from(b.x)).toEqual([0, 3, 3, 0]);
    expect(Array.from(b.y)).toEqual([0, 0, 2, 2]);
    expect(regionArea({ x: b.x, y: b.y, rings: Uint32Array.of(0) })).toBe(6);
  });

  it('perimeterParam runs counter-clockwise from (0, 0)', () => {
    expect(perimeterParam(0, 0, 3, 2)).toBe(0);
    expect(perimeterParam(1.5, 0, 3, 2)).toBe(1.5);
    expect(perimeterParam(3, 0, 3, 2)).toBe(3);
    expect(perimeterParam(3, 1, 3, 2)).toBe(4);
    expect(perimeterParam(3, 2, 3, 2)).toBe(5);
    expect(perimeterParam(1, 2, 3, 2)).toBe(7);
    expect(perimeterParam(0, 2, 3, 2)).toBe(8);
    expect(perimeterParam(0, 0.5, 3, 2)).toBe(9.5);
    expect(perimeterParam(0, 1e-17, 3, 2)).toBe(0);
  });
});
