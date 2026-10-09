/**
 * The move of a tree from one shape to another when a node is folded or unfolded (backlog G4), as
 * the sunburst moves between two levels. Pure: two ends in, a frame for any time between them out.
 *
 * Every node has a place at both ends, the hidden ones too: a tree layout parks a node that is
 * folded away on its nearest ancestor that shows. So a fold is every node gliding from where it
 * was to where it is now, the folded ones into their ancestor, fading out as they go; an unfold is
 * the same run backwards. A link shows as much as the fainter of its two ends, and its route moves
 * with it: point by point when both ends give it the same kind of route, from or to the straight
 * line between the nodes when only one does, and as a straight line when the two cannot be
 * matched.
 */
import type { LinkRoute } from '../layout/types.ts';
import type { GraphFrame } from './frame.ts';

/** A tree at rest, as a tween starts or ends on it. Positions are of every node. */
export interface TweenEnd {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly hidden: Uint8Array;
  readonly routes: readonly (LinkRoute | undefined)[] | undefined;
}

/** Slow start, slow stop. */
export function ease(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

/**
 * A straight route of `count` points from (`ax`, `ay`) to (`bx`, `by`). The points are evenly
 * spaced, which is a straight line read as a polyline and as cubic Bézier control points alike.
 */
function straight(count: number, ax: number, ay: number, bx: number, by: number): Float64Array {
  const points = new Float64Array(2 * count);
  for (let j = 0; j < count; j++) {
    const u = count > 1 ? j / (count - 1) : 0;
    points[2 * j] = ax + (bx - ax) * u;
    points[2 * j + 1] = ay + (by - ay) * u;
  }
  return points;
}

/**
 * The frames between `from` and `to` (the same nodes and links at both ends): a function of the
 * time, 0 to 1, eased here. `source` / `target`: the ends of every link.
 */
export function treeTween(
  from: TweenEnd,
  to: TweenEnd,
  source: Int32Array,
  target: Int32Array,
): (t: number) => Omit<GraphFrame, 'stamp'> {
  const n = to.x.length;
  const links = source.length;
  const hidden = new Uint8Array(n);
  let fading = false;
  for (let i = 0; i < n; i++) {
    // A node missing at both ends is missing throughout.
    if (from.hidden[i] === 1 && to.hidden[i] === 1) hidden[i] = 1;
    else if (from.hidden[i] !== to.hidden[i]) fading = true;
  }
  const routed = from.routes !== undefined || to.routes !== undefined;

  return (time) => {
    const t = ease(time);
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    const fade = fading ? new Float32Array(n).fill(1) : undefined;
    for (let i = 0; i < n; i++) {
      if (hidden[i] === 1) {
        x[i] = y[i] = NaN;
        continue;
      }
      const ax = from.x[i]!;
      const ay = from.y[i]!;
      // A node without a place at the start appears where it ends.
      x[i] = Number.isFinite(ax) ? ax + (to.x[i]! - ax) * t : to.x[i]!;
      y[i] = Number.isFinite(ay) ? ay + (to.y[i]! - ay) * t : to.y[i]!;
      if (fade && from.hidden[i] === 1) fade[i] = t;
      else if (fade && to.hidden[i] === 1) fade[i] = 1 - t;
    }
    let routes: (LinkRoute | undefined)[] | undefined;
    if (routed) {
      routes = new Array<LinkRoute | undefined>(links).fill(undefined);
      for (let k = 0; k < links; k++) {
        const a = from.routes?.[k];
        const b = to.routes?.[k];
        const shape = b ?? a;
        if (!shape) continue;
        if (a && b && (a.kind !== b.kind || a.points.length !== b.points.length)) continue;
        const s = source[k]!;
        const e = target[k]!;
        if (hidden[s] === 1 || hidden[e] === 1) continue;
        const count = shape.points.length >> 1;
        const pa = a?.points ?? straight(count, from.x[s]!, from.y[s]!, from.x[e]!, from.y[e]!);
        const pb = b?.points ?? straight(count, to.x[s]!, to.y[s]!, to.x[e]!, to.y[e]!);
        const points = new Float64Array(pa.length);
        let finite = true;
        for (let j = 0; j < points.length; j++) {
          points[j] = pa[j]! + (pb[j]! - pa[j]!) * t;
          if (!Number.isFinite(points[j])) finite = false;
        }
        if (finite) routes[k] = { points, kind: shape.kind };
      }
    }
    return { x, y, hidden, routes, ...(fade ? { fade } : {}) };
  };
}

/**
 * `end` as it looks under another view of the axes: positions that were drawn with the transform
 * `was` (px = linear × scale + offset, per axis), in the linear coordinates that put them on the
 * same pixels with the transform `now`. A fold changes the size of the tree and with it the
 * autorange; started from here, nothing jumps on the first frame.
 */
export function throughTransform(
  end: TweenEnd,
  was: { scaleX: number; scaleY: number; offsetX: number; offsetY: number },
  now: { scaleX: number; scaleY: number; offsetX: number; offsetY: number },
): TweenEnd {
  const kx = now.scaleX !== 0 ? was.scaleX / now.scaleX : 1;
  const ky = now.scaleY !== 0 ? was.scaleY / now.scaleY : 1;
  const dx = now.scaleX !== 0 ? (was.offsetX - now.offsetX) / now.scaleX : 0;
  const dy = now.scaleY !== 0 ? (was.offsetY - now.offsetY) / now.scaleY : 0;
  if (kx === 1 && ky === 1 && dx === 0 && dy === 0) return end;
  const routes = end.routes?.map((route) => {
    if (!route) return undefined;
    const points = Float64Array.from(route.points);
    for (let j = 0; j < points.length; j += 2) {
      points[j] = points[j]! * kx + dx;
      points[j + 1] = points[j + 1]! * ky + dy;
    }
    return { points, kind: route.kind };
  });
  return {
    x: end.x.map((v) => v * kx + dx),
    y: end.y.map((v) => v * ky + dy),
    hidden: end.hidden,
    routes,
  };
}

/**
 * Positions on the way from `from` to `to` at time `t`, 0 to 1, eased: what the view draws while
 * the picture glides from where it was to where a new calc, or a simulation that is still
 * running, puts it (backlog G5: after a node was dropped or released). A node without a place at
 * the start is where it ends.
 */
export function glide(
  from: { readonly x: Float64Array; readonly y: Float64Array },
  to: { readonly x: Float64Array; readonly y: Float64Array },
  t: number,
): { x: Float64Array; y: Float64Array } {
  const n = to.x.length;
  const e = ease(t);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const ax = from.x[i]!;
    const ay = from.y[i]!;
    x[i] = Number.isFinite(ax) ? ax + (to.x[i]! - ax) * e : to.x[i]!;
    y[i] = Number.isFinite(ay) ? ay + (to.y[i]! - ay) * e : to.y[i]!;
  }
  return { x, y };
}
