import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { regionArea } from './contour-fill.ts';
import { marchingSquares, type ContourPath } from './contour-march.ts';
import {
  clipPathToMask,
  hasGaps,
  inMask,
  maskIndex,
  maskRegion,
  presenceField,
} from './contour-mask.ts';

/** A 5 × 5 presence field with the given empty points. */
function field(empty: [number, number][], n = 5): Float64Array {
  const z = new Float64Array(n * n).fill(1);
  for (const [i, j] of empty) z[j * n + i] = NaN;
  return presenceField(z);
}

function path(points: [number, number][], closed = false): ContourPath {
  return {
    x: Float64Array.from(points.map((p) => p[0])),
    y: Float64Array.from(points.map((p) => p[1])),
    closed,
  };
}

function length(p: { x: ArrayLike<number>; y: ArrayLike<number> }): number {
  let s = 0;
  for (let k = 1; k < p.x.length; k++) {
    s += Math.hypot(p.x[k]! - p.x[k - 1]!, p.y[k]! - p.y[k - 1]!);
  }
  return s;
}

describe('gap mask (Plotly clipGaps)', () => {
  it('marks empty points', () => {
    const f = field([[2, 2]]);
    expect(f[12]).toBe(0);
    expect(f[0]).toBe(1);
    expect(hasGaps(f)).toBe(true);
    expect(hasGaps(field([]))).toBe(false);
  });

  it('cuts a diamond reaching 90% of the way to the neighbours around an isolated gap', () => {
    const f = field([[2, 2]]);
    const region = maskRegion(f, 5, 5);
    // Diamond with half-diagonal 0.9: area 2 · 0.9².
    expect(regionArea(region)).toBeCloseTo(16 - 2 * 0.81, 9);
    const m = maskIndex(f, 5, 5);
    expect(inMask(m, 2, 2)).toBe(false);
    expect(inMask(m, 2.4, 2.4)).toBe(false);
    expect(inMask(m, 2.5, 2.5)).toBe(true);
    expect(inMask(m, 2.95, 2)).toBe(true);
    expect(inMask(m, 1, 1)).toBe(true);
    expect(inMask(m, 2.5, 2.45)).toBe(true);
    expect(inMask(m, 2.5, 2.35)).toBe(false);
  });

  it('keeps a small diamond around a lone data point in a sea of gaps', () => {
    const empty: [number, number][] = [];
    for (let j = 0; j < 5; j++)
      for (let i = 0; i < 5; i++) if (i !== 2 || j !== 2) empty.push([i, j]);
    const f = field(empty);
    expect(regionArea(maskRegion(f, 5, 5))).toBeCloseTo(2 * 0.01, 9);
    const m = maskIndex(f, 5, 5);
    expect(inMask(m, 2.05, 2)).toBe(true);
    expect(inMask(m, 2.2, 2)).toBe(false);
  });

  it('clips lines at the mask boundary', () => {
    const m = maskIndex(field([[2, 2]]), 5, 5);
    // A horizontal line through the gap: cut from x = 1.1 to 2.9.
    const pieces = clipPathToMask(
      path([
        [0, 2],
        [4, 2],
      ]),
      m,
    );
    expect(pieces).toHaveLength(2);
    expect(pieces[0]!.x[pieces[0]!.x.length - 1]).toBeCloseTo(1.1, 12);
    expect(pieces[1]!.x[0]).toBeCloseTo(2.9, 12);
    expect(pieces.every((p) => !p.closed)).toBe(true);
    // Lines away from the gap come back unchanged.
    const away = path(
      [
        [0.5, 0.5],
        [3.5, 0.5],
        [3.5, 0.8],
      ],
      true,
    );
    expect(clipPathToMask(away, m)).toEqual([away]);
  });

  it('joins a cut closed path across its first point', () => {
    const m = maskIndex(field([[2, 2]]), 5, 5);
    // A triangle with one corner in the gap's diamond (|dx| + |dy| < 0.9 around (2, 2)).
    const corner: [number, number] = [2.5, 2];
    const others: [number, number][] = [
      [4, 0.5],
      [4, 3.5],
    ];
    const onDiamond = (p: ContourPath, k: number): number =>
      Math.abs(p.x[k]! - 2) + Math.abs(p.y[k]! - 2);
    for (const loop of [path([corner, ...others], true), path([...others, corner], true)]) {
      const pieces = clipPathToMask(loop, m);
      expect(pieces).toHaveLength(1);
      const p = pieces[0]!;
      expect(p.closed).toBe(false);
      expect(onDiamond(p, 0)).toBeCloseTo(0.9, 9);
      expect(onDiamond(p, p.x.length - 1)).toBeCloseTo(0.9, 9);
      // Both far corners are kept, in order.
      expect(p.x.length).toBe(4);
      expect([p.x[1], p.y[1], p.x[2], p.y[2]]).toEqual([4, 0.5, 4, 3.5]);
    }
  });

  it('property: kept pieces lie in the mask, and cutting loses no inside length', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 0, max: 4 }), fc.integer({ min: 0, max: 4 })), {
          maxLength: 6,
        }),
        fc.array(
          fc.tuple(
            fc.double({ min: 0, max: 4, noNaN: true }),
            fc.double({ min: 0, max: 4, noNaN: true }),
          ),
          { minLength: 2, maxLength: 8 },
        ),
        (empty, points) => {
          const m = maskIndex(field(empty), 5, 5);
          const input = path(points);
          const pieces = clipPathToMask(input, m);
          let kept = 0;
          for (const p of pieces) {
            kept += length(p);
            for (let k = 1; k < p.x.length; k++) {
              const mx = (p.x[k]! + p.x[k - 1]!) / 2;
              const my = (p.y[k]! + p.y[k - 1]!) / 2;
              expect(inMask(m, mx, my)).toBe(true);
            }
          }
          // Sampled inside length of the input approximates the kept length.
          let inside = 0;
          const steps = 400;
          for (let s = 1; s < points.length; s++) {
            const [ax, ay] = points[s - 1]!;
            const [bx, by] = points[s]!;
            const seg = Math.hypot(bx - ax, by - ay);
            for (let q = 0; q < steps; q++) {
              const t = (q + 0.5) / steps;
              if (inMask(m, ax + t * (bx - ax), ay + t * (by - ay))) inside += seg / steps;
            }
          }
          expect(Math.abs(kept - inside)).toBeLessThan(0.05 * length(input) + 1e-9);
        },
      ),
    );
  });

  it('agrees with marching squares on the mask boundary', () => {
    const f = field([
      [1, 1],
      [3, 2],
      [0, 4],
    ]);
    const m = maskIndex(f, 5, 5);
    for (const p of marchingSquares({ z: f, nx: 5, ny: 5 }, 0.9)) {
      for (let k = 0; k < p.x.length; k++) {
        // Boundary points are inside (boundary included) but points just off towards the gap
        // centers are not.
        expect(inMask(m, p.x[k]!, p.y[k]!)).toBe(true);
      }
    }
  });
});
