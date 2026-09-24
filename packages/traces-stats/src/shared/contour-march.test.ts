import { describe, expect, it } from 'vitest';
import { fillGaps } from './contour-gaps.ts';
import {
  indexToData,
  marchingSquares,
  marchLevels,
  pathToData,
  type ContourGrid,
  type ContourPath,
} from './contour-march.ts';

/** Grid from rows listed bottom (j = 0) first. */
function grid(rows: number[][]): ContourGrid {
  const ny = rows.length;
  const nx = rows[0]!.length;
  return { z: rows.flat(), nx, ny };
}

function signedArea(p: ContourPath): number {
  let s = 0;
  const n = p.x.length;
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    s += p.x[k]! * p.y[k1]! - p.x[k1]! * p.y[k]!;
  }
  return s / 2;
}

/** Deterministic pseudo-random values in [0, 1). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('marchingSquares', () => {
  const peak = grid([
    [0, 0, 0],
    [0, 1, 0],
    [0, 0, 0],
  ]);

  it('surrounds a single peak with one counter-clockwise ring', () => {
    const paths = marchingSquares(peak, 0.5);
    expect(paths).toHaveLength(1);
    const p = paths[0]!;
    expect(p.closed).toBe(true);
    expect(p.x).toHaveLength(4);
    expect(signedArea(p)).toBeCloseTo(0.5, 12);
    const pts = Array.from(p.x, (x, k) => `${x},${p.y[k]}`).sort();
    expect(pts).toEqual(['0.5,1', '1,0.5', '1,1.5', '1.5,1']);
  });

  it('surrounds a single valley with one clockwise ring', () => {
    const valley = grid([
      [1, 1, 1],
      [1, 0, 1],
      [1, 1, 1],
    ]);
    const paths = marchingSquares(valley, 0.5);
    expect(paths).toHaveLength(1);
    expect(paths[0]!.closed).toBe(true);
    expect(signedArea(paths[0]!)).toBeCloseTo(-0.5, 12);
  });

  it('crosses a plane gradient with one open path, above side on the left', () => {
    const plane = grid([
      [0, 1, 2, 3],
      [0, 1, 2, 3],
      [0, 1, 2, 3],
    ]);
    const paths = marchingSquares(plane, 1.5);
    expect(paths).toHaveLength(1);
    const p = paths[0]!;
    expect(p.closed).toBe(false);
    expect(Array.from(p.x)).toEqual([1.5, 1.5, 1.5]);
    // z grows with x: walking down (−y) keeps +x on the left.
    expect(Array.from(p.y)).toEqual([2, 1, 0]);
  });

  it('joins the above corners of a saddle when the center average is at or above the level', () => {
    const saddle = grid([
      [1, 0],
      [0, 1],
    ]);
    const paths = marchingSquares(saddle, 0.5);
    expect(paths).toHaveLength(2);
    const segs = paths.map((p) => [p.x[0], p.y[0], p.x[1], p.y[1]]);
    // Cut off the below corners (1, 0) and (0, 1).
    expect(segs).toContainEqual([0.5, 0, 1, 0.5]);
    expect(segs).toContainEqual([0.5, 1, 0, 0.5]);
  });

  it('separates the above corners of a saddle when the center average is below the level', () => {
    const saddle = grid([
      [1, 0],
      [0, 1],
    ]);
    const paths = marchingSquares(saddle, 0.6);
    expect(paths).toHaveLength(2);
    const segs = paths.map((p) =>
      Array.from([p.x[0]!, p.y[0]!, p.x[1]!, p.y[1]!], (v) => +v.toFixed(12)),
    );
    // Cut off the above corners (0, 0) and (1, 1).
    expect(segs).toContainEqual([0.4, 0, 0, 0.4]);
    expect(segs).toContainEqual([0.6, 1, 1, 0.6]);
  });

  it('counts corners exactly at the level as above', () => {
    const plane = grid([
      [0, 1, 2],
      [0, 1, 2],
      [0, 1, 2],
    ]);
    const paths = marchingSquares(plane, 1);
    expect(paths).toHaveLength(1);
    expect(Array.from(paths[0]!.x)).toEqual([1, 1, 1]);
    expect(Array.from(paths[0]!.y)).toEqual([2, 1, 0]);
    // A lone grid point exactly at the level is a degenerate ring: dropped.
    expect(marchingSquares(peak, 1)).toEqual([]);
    expect(marchingSquares(peak, 0)).toEqual([]);
  });

  it('skips cells with a non-finite corner', () => {
    const holed = { ...peak, z: [NaN, 0, 0, 0, 1, 0, 0, 0, 0] };
    const paths = marchingSquares(holed, 0.5);
    expect(paths).toHaveLength(1);
    expect(paths[0]!.closed).toBe(false);
    expect(paths[0]!.x).toHaveLength(4);
    for (const p of paths) for (const v of [...p.x, ...p.y]) expect(Number.isFinite(v)).toBe(true);
    // After filling the gap it closes again.
    const filled = { ...holed, z: fillGaps(holed.z, 3, 3) };
    expect(marchingSquares(filled, 0.5)[0]!.closed).toBe(true);
  });

  it('returns nothing for narrow grids or a non-finite level', () => {
    expect(marchingSquares({ z: [0, 1, 2], nx: 3, ny: 1 }, 0.5)).toEqual([]);
    expect(marchingSquares({ z: [0, 1, 2], nx: 1, ny: 3 }, 0.5)).toEqual([]);
    expect(marchingSquares(peak, NaN)).toEqual([]);
  });

  it('shares bit-identical edge crossings and visits each crossing once', () => {
    const rand = lcg(7);
    const nx = 9;
    const ny = 7;
    const z = Array.from({ length: nx * ny }, () => rand());
    const g = { z, nx, ny };
    for (const level of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      // Expected crossings, computed the same way (from the lower-index corner).
      const expected = new Set<string>();
      const edge = (i0: number, j0: number, i1: number, j1: number) => {
        const z0 = z[j0 * nx + i0]!;
        const z1 = z[j1 * nx + i1]!;
        if (z0 >= level === z1 >= level) return;
        const t = (level - z0) / (z1 - z0);
        expected.add(i1 > i0 ? `${i0 + t},${j0}` : `${i0},${j0 + t}`);
      };
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx - 1; i++) edge(i, j, i + 1, j);
      for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx; i++) edge(i, j, i, j + 1);
      const seen: string[] = [];
      for (const p of marchingSquares(g, level)) {
        for (let k = 0; k < p.x.length; k++) seen.push(`${p.x[k]},${p.y[k]}`);
        if (!p.closed) {
          const onBoundary = (x: number, y: number) =>
            x === 0 || y === 0 || x === nx - 1 || y === ny - 1;
          expect(onBoundary(p.x[0]!, p.y[0]!)).toBe(true);
          expect(onBoundary(p.x[p.x.length - 1]!, p.y[p.y.length - 1]!)).toBe(true);
        }
      }
      expect(seen.length).toBe(expected.size);
      expect(new Set(seen)).toEqual(expected);
    }
  });

  it('marchLevels runs every level', () => {
    const all = marchLevels(peak, [0.25, 0.5, 2]);
    expect(all.map((p) => p.length)).toEqual([1, 1, 0]);
  });
});

describe('index → data', () => {
  it('interpolates between (non-uniform) centers and extrapolates the ends', () => {
    const c = [0, 1, 3, 7];
    expect(indexToData(0, c)).toBe(0);
    expect(indexToData(2, c)).toBe(3);
    expect(indexToData(3, c)).toBe(7);
    expect(indexToData(1.5, c)).toBe(2);
    expect(indexToData(2.25, c)).toBe(4);
    expect(indexToData(-0.5, c)).toBe(-0.5);
    expect(indexToData(3.5, c)).toBe(9);
    expect(indexToData(0.3, [5])).toBe(5);
    expect(indexToData(0.3, [])).toBeNaN();
  });

  it('converts whole paths', () => {
    const p = pathToData(
      { x: Float64Array.of(0, 0.5), y: Float64Array.of(1, 1.5), closed: false },
      [10, 20],
      [0, 100, 200],
    );
    expect(Array.from(p.x)).toEqual([10, 15]);
    expect(Array.from(p.y)).toEqual([100, 150]);
    expect(p.closed).toBe(false);
  });
});
