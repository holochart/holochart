/**
 * A control polygon turned into the cubic Bézier chain a `'spline'` {@link LinkRoute} holds
 * (`3k + 1` control points): the curve hierarchical edge bundling draws through a link's path in
 * the hierarchy.
 *
 * The curve is the clamped (open uniform) B-spline of the polygon: it starts on the first point,
 * ends on the last, and is pulled toward the points between without passing through them. Its
 * degree is `min(3, N − 1)` for `N` points:
 * - `N = 2`: the straight segment, written as one cubic;
 * - `N = 3`: one quadratic Bézier, raised to a cubic (the same curve, exactly);
 * - `N ≥ 4`: a cubic B-spline over the knots `0 0 0 0 1 2 … N−3 N−3 N−3 N−3`, which is `N − 3`
 *   cubic pieces joined with continuous first and second derivatives.
 *
 * The conversion is exact, not a fit. The Bézier control points of the piece over the knot span
 * `[j, j + 1]` are the blossom of the spline at `(j, j, j)`, `(j, j, j + 1)`, `(j, j + 1, j + 1)`
 * and `(j + 1, j + 1, j + 1)`: de Boor's recurrence run with one of the three arguments per level
 * instead of the same parameter three times. Only `+ − × ÷` are used, which IEEE 754 rounds the
 * same way everywhere, so the same polygon gives the same bytes on every machine.
 */
import type { LinkRoute } from '../types.ts';

/** Knot `i` of the clamped uniform cubic knot vector of `n` control points. */
const knot = (i: number, n: number): number => (i < 3 ? 0 : i > n ? n - 3 : i - 3);

/**
 * The blossom of the cubic B-spline of `polygon` (`n` points) at `(a, b, c)`, all three within the
 * knot span `[j, j + 1]`, written to point `at` of `out`.
 */
function blossom(
  polygon: Float64Array,
  n: number,
  j: number,
  a: number,
  b: number,
  c: number,
  out: Float64Array,
  at: number,
): void {
  // The span is [t_k, t_k+1] with k = j + 3; the four control points that act on it are j … j + 3.
  const k = j + 3;
  let x0 = polygon[2 * j]!;
  let y0 = polygon[2 * j + 1]!;
  let x1 = polygon[2 * j + 2]!;
  let y1 = polygon[2 * j + 3]!;
  let x2 = polygon[2 * j + 4]!;
  let y2 = polygon[2 * j + 5]!;
  const x3 = polygon[2 * j + 6]!;
  const y3 = polygon[2 * j + 7]!;
  // Level 1 (argument a): points k − 2 … k, each from the knots t_i and t_i+3.
  let t = knot(k - 2, n);
  let w = (a - t) / (knot(k + 1, n) - t);
  x0 = (1 - w) * x0 + w * x1;
  y0 = (1 - w) * y0 + w * y1;
  t = knot(k - 1, n);
  w = (a - t) / (knot(k + 2, n) - t);
  x1 = (1 - w) * x1 + w * x2;
  y1 = (1 - w) * y1 + w * y2;
  t = knot(k, n);
  w = (a - t) / (knot(k + 3, n) - t);
  x2 = (1 - w) * x2 + w * x3;
  y2 = (1 - w) * y2 + w * y3;
  // Level 2 (argument b): points k − 1 and k, from t_i and t_i+2.
  t = knot(k - 1, n);
  w = (b - t) / (knot(k + 1, n) - t);
  x0 = (1 - w) * x0 + w * x1;
  y0 = (1 - w) * y0 + w * y1;
  t = knot(k, n);
  w = (b - t) / (knot(k + 2, n) - t);
  x1 = (1 - w) * x1 + w * x2;
  y1 = (1 - w) * y1 + w * y2;
  // Level 3 (argument c): point k, from t_k and t_k+1.
  t = knot(k, n);
  w = (c - t) / (knot(k + 1, n) - t);
  out[2 * at] = (1 - w) * x0 + w * x1;
  out[2 * at + 1] = (1 - w) * y0 + w * y1;
}

/**
 * The cubic Bézier control points of the clamped B-spline of a control polygon (see the module
 * comment): a flat `[x0, y0, x1, y1, …]` of `3k + 1` points, `k = max(1, count − 3)` pieces, whose
 * first and last points are the polygon's first and last points bit for bit.
 *
 * `polygon` is flat too; `count` is the number of its points to read (default: all of them). Fewer
 * than two points give an empty array.
 */
export function bsplineToBezier(
  polygon: Float64Array,
  count: number = polygon.length >> 1,
): Float64Array {
  const n = Math.min(Math.floor(count), polygon.length >> 1);
  if (!(n >= 2)) return new Float64Array(0);
  const ax = polygon[0]!;
  const ay = polygon[1]!;
  const bx = polygon[2 * n - 2]!;
  const by = polygon[2 * n - 1]!;
  const pieces = n > 3 ? n - 3 : 1;
  const out = new Float64Array(6 * pieces + 2);
  if (n === 2) {
    // A segment as a cubic: the control points at its thirds.
    out[2] = ax + (bx - ax) / 3;
    out[3] = ay + (by - ay) / 3;
    out[4] = bx + (ax - bx) / 3;
    out[5] = by + (ay - by) / 3;
  } else if (n === 3) {
    // Degree elevation of the quadratic Bézier (a, m, b): two thirds of the way to m from each end.
    const mx = polygon[2]!;
    const my = polygon[3]!;
    out[2] = ax + (2 * (mx - ax)) / 3;
    out[3] = ay + (2 * (my - ay)) / 3;
    out[4] = bx + (2 * (mx - bx)) / 3;
    out[5] = by + (2 * (my - by)) / 3;
  } else {
    for (let j = 0; j < pieces; j++) {
      blossom(polygon, n, j, j, j, j + 1, out, 3 * j + 1);
      blossom(polygon, n, j, j, j + 1, j + 1, out, 3 * j + 2);
      if (j + 1 < pieces) blossom(polygon, n, j, j + 1, j + 1, j + 1, out, 3 * j + 3);
    }
  }
  // The ends as given, not as the arithmetic rounds them (and never −0 for 0 or the reverse).
  out[0] = ax;
  out[1] = ay;
  out[out.length - 2] = bx;
  out[out.length - 1] = by;
  return out;
}

/** A `'spline'` route through the clamped B-spline of a control polygon of at least two points. */
export function bsplineRoute(polygon: Float64Array, count?: number): LinkRoute {
  return { points: bsplineToBezier(polygon, count), kind: 'spline' };
}
