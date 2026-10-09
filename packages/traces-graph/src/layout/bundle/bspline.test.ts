import { describe, expect, it } from 'vitest';
import { cubicAt } from './__testing__/curves.ts';
import { bsplineRoute, bsplineToBezier } from './bspline.ts';

/** The clamped uniform cubic knot vector of `n` control points. */
function knots(n: number): number[] {
  const t: number[] = [];
  for (let i = 0; i < n + 4; i++) t.push(Math.min(n - 3, Math.max(0, i - 3)));
  return t;
}

/** A B-spline basis function by the Cox–de Boor recursion: the textbook definition. */
function basis(i: number, p: number, u: number, t: number[]): number {
  if (p === 0) return u >= t[i]! && u < t[i + 1]! ? 1 : 0;
  const left = t[i + p]! - t[i]!;
  const right = t[i + p + 1]! - t[i + 1]!;
  return (
    (left > 0 ? ((u - t[i]!) / left) * basis(i, p - 1, u, t) : 0) +
    (right > 0 ? ((t[i + p + 1]! - u) / right) * basis(i + 1, p - 1, u, t) : 0)
  );
}

/** The cubic B-spline of a polygon at `u`, from the definition. */
function splineAt(polygon: number[], u: number): [number, number] {
  const n = polygon.length / 2;
  const t = knots(n);
  let x = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    const b = basis(i, 3, u, t);
    x += b * polygon[2 * i]!;
    y += b * polygon[2 * i + 1]!;
  }
  return [x, y];
}

const POLYGON = [1, 2, 4, 9, 7, -3, 12, 5, 15, 8, 21, -6, 30, 2, 31, 14];

describe('bsplineToBezier', () => {
  it('gives nothing for fewer than two points', () => {
    expect(bsplineToBezier(new Float64Array(0))).toHaveLength(0);
    expect(bsplineToBezier(new Float64Array([3, 4]))).toHaveLength(0);
    expect(bsplineToBezier(new Float64Array(POLYGON), 1)).toHaveLength(0);
    expect(bsplineToBezier(new Float64Array(POLYGON), NaN)).toHaveLength(0);
  });

  it('writes two points as a straight cubic', () => {
    const out = bsplineToBezier(new Float64Array([1, 2, 7, 14]));
    expect(out).toHaveLength(8);
    expect(Array.from(out.subarray(0, 2))).toEqual([1, 2]);
    expect(Array.from(out.subarray(6))).toEqual([7, 14]);
    for (const t of [0.25, 0.5, 0.75]) {
      const [x, y] = cubicAt(out, 0, t);
      expect(x).toBeCloseTo(1 + 6 * t, 12);
      expect(y).toBeCloseTo(2 + 12 * t, 12);
    }
  });

  it('raises three points to the cubic of their quadratic Bézier', () => {
    const [ax, ay, mx, my, bx, by] = [1, 2, 5, 11, 9, -4];
    const out = bsplineToBezier(new Float64Array([ax, ay, mx, my, bx, by]));
    expect(out).toHaveLength(8);
    for (let s = 0; s <= 10; s++) {
      const t = s / 10;
      const u = 1 - t;
      const [x, y] = cubicAt(out, 0, t);
      expect(x).toBeCloseTo(u * u * ax + 2 * u * t * mx + t * t * bx, 12);
      expect(y).toBeCloseTo(u * u * ay + 2 * u * t * my + t * t * by, 12);
    }
  });

  it('keeps four points as they are: one cubic with those control points', () => {
    const polygon = new Float64Array([1, 2, 4, 9, 7, 3, 12, 5]);
    expect(Array.from(bsplineToBezier(polygon))).toEqual(Array.from(polygon));
  });

  it('is the clamped cubic B-spline of five or more points, as n − 3 cubic pieces', () => {
    for (let n = 5; n <= 8; n++) {
      const polygon = POLYGON.slice(0, 2 * n);
      const out = bsplineToBezier(new Float64Array(polygon));
      expect(out).toHaveLength(2 * (3 * (n - 3) + 1));
      for (let j = 0; j < n - 3; j++) {
        for (const t of [0, 0.1, 0.37, 0.5, 0.9]) {
          const [x, y] = cubicAt(out, 6 * j, t);
          const [wantX, wantY] = splineAt(polygon, j + t);
          expect(x).toBeCloseTo(wantX, 10);
          expect(y).toBeCloseTo(wantY, 10);
        }
      }
    }
  });

  it('joins its pieces smoothly: the tangent is the same on both sides of a joint', () => {
    const out = bsplineToBezier(new Float64Array(POLYGON));
    for (let j = 3; j + 3 < out.length / 2; j += 3) {
      expect(out[2 * j]! - out[2 * j - 2]!).toBeCloseTo(out[2 * j + 2]! - out[2 * j]!, 10);
      expect(out[2 * j + 1]! - out[2 * j - 1]!).toBeCloseTo(out[2 * j + 3]! - out[2 * j + 1]!, 10);
    }
  });

  it('starts and ends on the polygon ends bit for bit', () => {
    for (let n = 2; n <= 8; n++) {
      const polygon = new Float64Array(POLYGON.slice(0, 2 * n));
      polygon[0] = -0;
      polygon[1] = 0.1 + 0.2;
      polygon[2 * n - 2] = 1 / 3;
      polygon[2 * n - 1] = -0;
      const out = bsplineToBezier(polygon);
      expect(out[0]).toBe(-0);
      expect(out[1]).toBe(0.1 + 0.2);
      expect(out[out.length - 2]).toBe(1 / 3);
      expect(out[out.length - 1]).toBe(-0);
    }
  });

  it('reads only the first `count` points of a longer buffer', () => {
    const buffer = new Float64Array(POLYGON);
    expect(Array.from(bsplineToBezier(buffer, 5))).toEqual(
      Array.from(bsplineToBezier(new Float64Array(POLYGON.slice(0, 10)))),
    );
    // A count beyond the buffer is the whole buffer.
    expect(Array.from(bsplineToBezier(buffer, 99))).toEqual(Array.from(bsplineToBezier(buffer)));
  });

  it('bsplineRoute wraps the control points as a spline route', () => {
    const route = bsplineRoute(new Float64Array(POLYGON));
    expect(route.kind).toBe('spline');
    expect(Array.from(route.points)).toEqual(
      Array.from(bsplineToBezier(new Float64Array(POLYGON))),
    );
  });
});
