/**
 * Test helpers of the edge-bundling suites: sample a route into points, measure how far a path
 * strays from a point or from its chord, and a seeded generator for fixtures.
 */
import type { LinkRoute } from '../../types.ts';

/** A route as a list of `[x, y]`: a polyline's points, or `samples` points per cubic piece. */
export function sample(route: LinkRoute, samples = 32): [number, number][] {
  const p = route.points;
  const out: [number, number][] = [];
  if (route.kind === 'polyline') {
    for (let i = 0; i + 1 < p.length; i += 2) out.push([p[i]!, p[i + 1]!]);
    return out;
  }
  out.push([p[0]!, p[1]!]);
  for (let i = 0; i + 7 < p.length; i += 6) {
    for (let s = 1; s <= samples; s++) out.push(cubicAt(p, i, s / samples));
  }
  return out;
}

/** The point at `t` of the cubic Bézier whose first control point is at offset `i` of `p`. */
export function cubicAt(p: ArrayLike<number>, i: number, t: number): [number, number] {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * p[i]! + b * p[i + 2]! + c * p[i + 4]! + d * p[i + 6]!,
    a * p[i + 1]! + b * p[i + 3]! + c * p[i + 5]! + d * p[i + 7]!,
  ];
}

/** The smallest distance from the sampled points of a route to a point. */
export function closest(route: LinkRoute, x: number, y: number): number {
  let best = Infinity;
  for (const [px, py] of sample(route, 256)) best = Math.min(best, Math.hypot(px - x, py - y));
  return best;
}

/** The largest distance from the sampled points of a route to the straight line between its ends. */
export function bend(route: LinkRoute): number {
  const points = sample(route, 64);
  const [ax, ay] = points[0]!;
  const [bx, by] = points[points.length - 1]!;
  const length = Math.hypot(bx - ax, by - ay);
  let worst = 0;
  for (const [px, py] of points) {
    worst = Math.max(worst, Math.abs((px - ax) * (by - ay) - (py - ay) * (bx - ax)) / length);
  }
  return worst;
}

/** True when the route's numbers are all finite and its length fits its kind. */
export function wellFormed(route: LinkRoute): boolean {
  const p = route.points;
  if (!p.every(Number.isFinite) || p.length % 2 !== 0) return false;
  const count = p.length / 2;
  return route.kind === 'spline' ? count >= 4 && (count - 1) % 3 === 0 : count >= 2;
}

/** The bytes of a route's points, to compare two runs bit for bit. */
export const bytes = (route: LinkRoute): number[] =>
  Array.from(new Uint8Array(route.points.buffer, route.points.byteOffset, route.points.byteLength));

/** A seeded generator of values in `[0, 1)` (the constants the force layout uses). */
export function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
