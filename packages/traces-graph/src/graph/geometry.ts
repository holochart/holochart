/**
 * Link geometry of the `graph` trace (backlog G1, ADR-029): every link as a polyline in one
 * vertex stream for the line primitive, and the arrowheads as marker instances. Pure.
 *
 * A link's path is, in this order: the route its layout gave it (a polyline, or cubic Bézier
 * control points); a loop when it is a self-link; a quadratic curve when it has a curvature
 * (`link.curve`, or the fan of parallel links); else the straight segment between the node
 * centers. Paths are built in screen space (linear coordinates times the axis scales), so a curve
 * bows at right angles to its link on screen whatever the two axis scales are, and then stored in
 * linear coordinates, so that a pan or a zoom is the transform alone.
 *
 * A route may end on the outline its layout knew for the node, which is the node's size in layout
 * units. On screen a node keeps its size in px while the route is scaled with the axes, so the
 * end of a route can be short of the node or inside it. Each end is therefore carried on into the
 * node, along the route's last direction (to the center when that would miss the node): the line
 * then disappears under the node at any zoom, and an arrowhead is cut where the path really
 * crosses the outline.
 *
 * ## What depends on the zoom
 *
 * - An end with an arrowhead is cut back to the node's outline (the circle of a marker, the
 *   rectangle of a box), which is a size in px: the tip sits on the outline and the line stops
 *   inside the head. Loops are sized from their node in px too, and so is how far a route is
 *   carried into its nodes. A graph with any of them is rebuilt when the scale changes
 *   ({@link LinkGeometry.depends} `'scale'`).
 * - Curves keep their shape under a zoom of both axes by the same factor, and change when the
 *   aspect of the two scales changes (`'aspect'`).
 * - Straight links between centers never change (`'none'`).
 */
import type { LinkRoute } from '../layout/types.ts';

/** What the geometry is built from. Arrays are indexed by node or by (kept) link. */
export interface LinkGeometryInput {
  /** Node centers in linear coordinates, and the nodes not drawn. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly hidden: Uint8Array;
  readonly source: Int32Array;
  readonly target: Int32Array;
  /** Half the node extents in px, and whether nodes are boxes (else circles of `halfWidth`). */
  readonly halfWidth: Float64Array;
  readonly halfHeight: Float64Array;
  readonly box: boolean;
  /** Curvature of each link (0: straight), and the self-link numbers (-1: not a loop). */
  readonly curve: Float32Array;
  readonly loop: Int32Array;
  readonly routes?: readonly (LinkRoute | undefined)[] | undefined;
  /**
   * The fewest segments a cubic piece of a spline route is drawn with (default
   * {@link SPLINE_SEGMENTS_MIN}): fewer for the bundles of a large graph.
   */
  readonly splineSegments?: number | undefined;
  /** 1 for the links that are left out (a hive plot's links within one axis). */
  readonly skip?: Uint8Array | undefined;
  readonly arrowEnd: boolean;
  readonly arrowStart: boolean;
  /** Arrowhead length of each link in px. */
  readonly arrowSize: Float32Array;
  /**
   * The side of node `i` its label is on, as a screen direction with y up (`[0, 0]` for none):
   * loops keep away from it.
   */
  readonly labelSide?: ((i: number) => readonly [number, number]) | undefined;
  /** Px per linear unit along x and y, signed (a reversed axis is negative). */
  readonly scaleX: number;
  readonly scaleY: number;
}

/** The arrowheads: one marker each, with its tip at (`x`, `y`). */
export interface ArrowGeometry {
  readonly count: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** Degrees clockwise on screen from pointing up (the marker primitive's `angle`). */
  readonly angle: Float32Array;
  /** Marker size in px (the head's length). */
  readonly size: Float32Array;
  /** The link each head belongs to. */
  readonly link: Uint32Array;
}

export interface LinkGeometry {
  /**
   * The vertex stream in linear coordinates, and the index where each polyline after the first
   * starts (the line primitive's `starts`).
   */
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly starts: Uint32Array;
  /**
   * Vertices of link `k`: `[offsets[k], offsets[k + 1])`; empty for a link that is not drawn (a
   * hidden end, or no room between two overlapping nodes).
   */
  readonly offsets: Uint32Array;
  readonly arrows: ArrowGeometry;
  /** What a change of the axis scales does to the geometry (see the module comment). */
  readonly depends: 'none' | 'aspect' | 'scale';
  /** The scales it was built for. */
  readonly scaleX: number;
  readonly scaleY: number;
}

/** Segments a curved link is drawn with. */
const CURVE_SEGMENTS = 16;
/**
 * Segments per cubic piece of a spline route: one for about every {@link SPLINE_STEP} px of its
 * control polygon, within these bounds (a short piece between two layers, a long arc of a hive
 * plot). And the segments of a loop.
 */
const SPLINE_SEGMENTS_MIN = 12;
const SPLINE_SEGMENTS_MAX = 48;
const SPLINE_STEP = 8;
const LOOP_SEGMENTS = 24;
/** How far inside the arrowhead the line ends, as a fraction of the head's length. */
const HEAD_OVERLAP = 0.7;
/** A loop reaches this far beyond its node, in px, plus a step for every further loop. */
export const LOOP_REACH = 14;
export const LOOP_STEP = 8;
/** How much a node's label pushes its loops away, in neighbours. */
const LABEL_WEIGHT = 3;
/** Half the opening angle of a loop at its node, in radians. */
const LOOP_SPREAD = (38 * Math.PI) / 180;

/** A growable `[x0, y0, x1, y1, …]` list. */
export class Points {
  data = new Float64Array(64);
  /** Number of points. */
  n = 0;

  clear(): void {
    this.n = 0;
  }

  push(x: number, y: number): void {
    if (2 * this.n + 2 > this.data.length) {
      const grown = new Float64Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    this.data[2 * this.n] = x;
    this.data[2 * this.n + 1] = y;
    this.n++;
  }

  reverse(): void {
    const d = this.data;
    for (let i = 0, j = this.n - 1; i < j; i++, j--) {
      const x = d[2 * i]!;
      const y = d[2 * i + 1]!;
      d[2 * i] = d[2 * j]!;
      d[2 * i + 1] = d[2 * j + 1]!;
      d[2 * j] = x;
      d[2 * j + 1] = y;
    }
  }
}

/** A node's outline in screen space, grown by `extra` px. */
export interface Outline {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  box: boolean;
}

function inside(o: Outline, x: number, y: number, extra: number): boolean {
  const dx = x - o.cx;
  const dy = y - o.cy;
  if (o.box) return Math.abs(dx) <= o.hw + extra && Math.abs(dy) <= o.hh + extra;
  const r = o.hw + extra;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Cut the end of a path back to where it enters `outline` grown by `extra`: the last point becomes
 * the point on that outline. Returns `false` (and leaves the path alone) when the whole path is
 * inside, so there is nothing to draw.
 */
export function cutTail(path: Points, outline: Outline, extra: number): boolean {
  const d = path.data;
  let j = path.n - 1;
  while (j >= 0 && inside(outline, d[2 * j]!, d[2 * j + 1]!, extra)) j--;
  if (j < 0) return false;
  // The path ends outside the outline already (a route that stops short of the node).
  if (j === path.n - 1) return true;
  // Between point j (outside) and j + 1 (inside): bisect for the crossing.
  let ax = d[2 * j]!;
  let ay = d[2 * j + 1]!;
  let bx = d[2 * j + 2]!;
  let by = d[2 * j + 3]!;
  for (let step = 0; step < 24; step++) {
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    if (inside(outline, mx, my, extra)) {
      bx = mx;
      by = my;
    } else {
      ax = mx;
      ay = my;
    }
  }
  d[2 * j + 2] = (ax + bx) / 2;
  d[2 * j + 3] = (ay + by) / 2;
  path.n = j + 2;
  return true;
}

/**
 * Carry the end of a routed path on into the node it ends at (see the module comment): nothing
 * for a path that ends inside `outline` already; else one more point, the point of the ray along
 * the last segment that is nearest the node's center when that is inside the node, else the
 * center.
 */
export function extendTail(path: Points, outline: Outline): void {
  const d = path.data;
  const n = path.n;
  if (n < 1) return;
  const lx = d[2 * n - 2]!;
  const ly = d[2 * n - 1]!;
  if (inside(outline, lx, ly, 0)) return;
  if (n >= 2) {
    const dx = lx - d[2 * n - 4]!;
    const dy = ly - d[2 * n - 3]!;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      const along = ((outline.cx - lx) * dx + (outline.cy - ly) * dy) / len;
      const qx = lx + (dx / len) * along;
      const qy = ly + (dy / len) * along;
      if (along > 0 && inside(outline, qx, qy, 0)) {
        path.push(qx, qy);
        return;
      }
    }
  }
  path.push(outline.cx, outline.cy);
}

/** Sample a quadratic Bézier (without its first point) into `path`. */
function quadratic(
  path: Points,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  segments: number,
): void {
  for (let s = 1; s <= segments; s++) {
    const t = s / segments;
    const u = 1 - t;
    path.push(u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1);
  }
}

/** Sample a cubic Bézier (without its first point) into `path`. */
function cubic(
  path: Points,
  p: readonly [number, number, number, number, number, number, number, number],
  segments: number,
): void {
  for (let s = 1; s <= segments; s++) {
    const t = s / segments;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const e = t * t * t;
    path.push(a * p[0] + b * p[2] + c * p[4] + e * p[6], a * p[1] + b * p[3] + c * p[5] + e * p[7]);
  }
}

/**
 * The direction a node's loops point in, in screen space: away from the node's neighbours (the
 * sum of the unit vectors to them) and from its label, or up for a node with neither. `out` is
 * `[ux, uy]` per node.
 */
function loopDirections(input: LinkGeometryInput, sx: number, sy: number): Float64Array {
  const n = input.x.length;
  const out = new Float64Array(2 * n);
  for (let k = 0; k < input.source.length; k++) {
    const a = input.source[k]!;
    const b = input.target[k]!;
    if (a === b) continue;
    const dx = (input.x[b]! - input.x[a]!) * sx;
    const dy = (input.y[b]! - input.y[a]!) * sy;
    const len = Math.hypot(dx, dy);
    if (!(len > 0)) continue;
    out[2 * a] = out[2 * a]! - dx / len;
    out[2 * a + 1] = out[2 * a + 1]! - dy / len;
    out[2 * b] = out[2 * b]! + dx / len;
    out[2 * b + 1] = out[2 * b + 1]! + dy / len;
  }
  if (input.labelSide) {
    // Only the nodes with a loop are asked. The label weighs more than one neighbour.
    for (let k = 0; k < input.source.length; k++) {
      const a = input.source[k]!;
      if (a !== input.target[k] || input.loop[k] !== 0) continue;
      const [lx, ly] = input.labelSide(a);
      out[2 * a] = out[2 * a]! - LABEL_WEIGHT * lx;
      out[2 * a + 1] = out[2 * a + 1]! - LABEL_WEIGHT * ly;
    }
  }
  for (let i = 0; i < n; i++) {
    const len = Math.hypot(out[2 * i]!, out[2 * i + 1]!);
    if (len > 1e-6) {
      out[2 * i] = out[2 * i]! / len;
      out[2 * i + 1] = out[2 * i + 1]! / len;
    } else {
      out[2 * i] = 0;
      out[2 * i + 1] = 1;
    }
  }
  return out;
}

/** Build the geometry of every link (see the module comment). */
export function buildLinkGeometry(input: LinkGeometryInput): LinkGeometry {
  const { source, target, hidden, curve, loop, routes } = input;
  const links = source.length;
  // Zero or non-finite scales (a plot area of no size) still give finite geometry.
  const sx = Number.isFinite(input.scaleX) && input.scaleX !== 0 ? input.scaleX : 1;
  const sy = Number.isFinite(input.scaleY) && input.scaleY !== 0 ? input.scaleY : 1;
  const arrows = input.arrowEnd || input.arrowStart;
  const heads = (input.arrowEnd ? 1 : 0) + (input.arrowStart ? 1 : 0);
  const splineMin = Math.max(1, Math.min(SPLINE_SEGMENTS_MIN, input.splineSegments ?? Infinity));

  let cap = 2 * links + 16;
  let outX = new Float64Array(cap);
  let outY = new Float64Array(cap);
  let count = 0;
  const starts = new Uint32Array(links);
  let startCount = 0;
  const offsets = new Uint32Array(links + 1);
  const arrowX = new Float64Array(heads * links);
  const arrowY = new Float64Array(heads * links);
  const arrowAngle = new Float32Array(heads * links);
  const arrowSizes = new Float32Array(heads * links);
  const arrowLink = new Uint32Array(heads * links);
  let arrowCount = 0;

  let curved = false;
  let looped = false;
  let routed = false;
  let loopDirection: Float64Array | undefined;
  const path = new Points();
  const from: Outline = { cx: 0, cy: 0, hw: 0, hh: 0, box: input.box };
  const to: Outline = { cx: 0, cy: 0, hw: 0, hh: 0, box: input.box };

  /** Put an arrowhead at the end of `path` and pull the line back into it. */
  const head = (k: number, outline: Outline): boolean => {
    const size = input.arrowSize[k]!;
    if (!cutTail(path, outline, 0)) return false;
    const tipX = path.data[2 * path.n - 2]!;
    const tipY = path.data[2 * path.n - 1]!;
    if (!cutTail(path, outline, size * HEAD_OVERLAP)) return false;
    let dx = tipX - path.data[2 * path.n - 2]!;
    let dy = tipY - path.data[2 * path.n - 1]!;
    if (dx === 0 && dy === 0 && path.n > 1) {
      // The path stopped short of the node: point along its last segment.
      dx = tipX - path.data[2 * path.n - 4]!;
      dy = tipY - path.data[2 * path.n - 3]!;
    }
    arrowX[arrowCount] = tipX / sx;
    arrowY[arrowCount] = tipY / sy;
    // Screen y is up here: clockwise from up is atan2(dx, dy).
    arrowAngle[arrowCount] = (Math.atan2(dx, dy) * 180) / Math.PI;
    arrowSizes[arrowCount] = size;
    arrowLink[arrowCount] = k;
    arrowCount++;
    return true;
  };

  for (let k = 0; k < links; k++) {
    offsets[k] = count;
    const a = source[k]!;
    const b = target[k]!;
    if (hidden[a] === 1 || hidden[b] === 1 || input.skip?.[k] === 1) continue;
    const ax = input.x[a]! * sx;
    const ay = input.y[a]! * sy;
    const bx = input.x[b]! * sx;
    const by = input.y[b]! * sy;
    if (!Number.isFinite(ax + ay + bx + by)) continue;
    path.clear();
    const route = routes?.[k];
    if (route && route.points.length >= 4) {
      const p = route.points;
      // A route that ends on its nodes' outlines is carried into them by a length in px.
      const last = p.length - 2;
      if (
        Math.abs(p[0]! * sx - ax) + Math.abs(p[1]! * sy - ay) > 1e-6 ||
        Math.abs(p[last]! * sx - bx) + Math.abs(p[last + 1]! * sy - by) > 1e-6
      ) {
        routed = true;
      }
      path.push(p[0]! * sx, p[1]! * sy);
      if (route.kind === 'spline' && p.length >= 8) {
        for (let i = 0; i + 7 < p.length; i += 6) {
          const piece = [
            p[i]! * sx,
            p[i + 1]! * sy,
            p[i + 2]! * sx,
            p[i + 3]! * sy,
            p[i + 4]! * sx,
            p[i + 5]! * sy,
            p[i + 6]! * sx,
            p[i + 7]! * sy,
          ] as const;
          // The control polygon is at least as long as the curve.
          const length =
            Math.hypot(piece[2] - piece[0], piece[3] - piece[1]) +
            Math.hypot(piece[4] - piece[2], piece[5] - piece[3]) +
            Math.hypot(piece[6] - piece[4], piece[7] - piece[5]);
          const segments = Math.ceil(length / SPLINE_STEP);
          cubic(
            path,
            piece,
            Number.isFinite(segments)
              ? Math.min(SPLINE_SEGMENTS_MAX, Math.max(splineMin, segments))
              : splineMin,
          );
        }
      } else {
        for (let i = 2; i + 1 < p.length; i += 2) path.push(p[i]! * sx, p[i + 1]! * sy);
      }
      // Both ends on into their nodes, whatever the zoom made of the route's own ends.
      to.cx = bx;
      to.cy = by;
      to.hw = input.halfWidth[b]!;
      to.hh = input.halfHeight[b]!;
      extendTail(path, to);
      from.cx = ax;
      from.cy = ay;
      from.hw = input.halfWidth[a]!;
      from.hh = input.halfHeight[a]!;
      path.reverse();
      extendTail(path, from);
      path.reverse();
    } else if (a === b) {
      looped = true;
      loopDirection ??= loopDirections(input, sx, sy);
      const ux = loopDirection[2 * a]!;
      const uy = loopDirection[2 * a + 1]!;
      const r = input.box
        ? Math.max(input.halfWidth[a]!, input.halfHeight[a]!)
        : input.halfWidth[a]!;
      // The curve's apex is at three quarters of the control points' distance along `u`.
      const reach = r + Math.max(LOOP_REACH, r) + LOOP_STEP * Math.max(0, loop[k]!);
      const h = reach / (0.75 * Math.cos(LOOP_SPREAD));
      const cos = Math.cos(LOOP_SPREAD);
      const sin = Math.sin(LOOP_SPREAD);
      path.push(ax, ay);
      cubic(
        path,
        [
          ax,
          ay,
          ax + h * (ux * cos + uy * sin),
          ay + h * (uy * cos - ux * sin),
          ax + h * (ux * cos - uy * sin),
          ay + h * (uy * cos + ux * sin),
          ax,
          ay,
        ],
        LOOP_SEGMENTS,
      );
    } else {
      const c = curve[k]!;
      path.push(ax, ay);
      if (c !== 0 && Number.isFinite(c)) {
        curved = true;
        // The apex of a quadratic curve is half as far from the chord as its control point.
        const nx = -(by - ay);
        const ny = bx - ax;
        quadratic(
          path,
          ax,
          ay,
          (ax + bx) / 2 + 2 * c * nx,
          (ay + by) / 2 + 2 * c * ny,
          bx,
          by,
          CURVE_SEGMENTS,
        );
      } else {
        path.push(bx, by);
      }
    }

    if (arrows) {
      to.cx = bx;
      to.cy = by;
      to.hw = input.halfWidth[b]!;
      to.hh = input.halfHeight[b]!;
      const before = arrowCount;
      let drawn = true;
      if (input.arrowEnd) drawn = head(k, to);
      if (drawn && input.arrowStart) {
        from.cx = ax;
        from.cy = ay;
        from.hw = input.halfWidth[a]!;
        from.hh = input.halfHeight[a]!;
        path.reverse();
        drawn = head(k, from);
        path.reverse();
      }
      if (!drawn || path.n < 2) {
        // No room for the link between its nodes: neither line nor heads.
        arrowCount = before;
        continue;
      }
    }

    if (count + path.n > cap) {
      cap = Math.max(cap * 2, count + path.n);
      const gx = new Float64Array(cap);
      const gy = new Float64Array(cap);
      gx.set(outX.subarray(0, count));
      gy.set(outY.subarray(0, count));
      outX = gx;
      outY = gy;
    }
    if (count > 0) starts[startCount++] = count;
    for (let i = 0; i < path.n; i++) {
      outX[count] = path.data[2 * i]! / sx;
      outY[count] = path.data[2 * i + 1]! / sy;
      count++;
    }
  }
  offsets[links] = count;

  return {
    x: outX.subarray(0, count),
    y: outY.subarray(0, count),
    starts: starts.subarray(0, startCount),
    offsets,
    arrows: {
      count: arrowCount,
      x: arrowX.subarray(0, arrowCount),
      y: arrowY.subarray(0, arrowCount),
      angle: arrowAngle.subarray(0, arrowCount),
      size: arrowSizes.subarray(0, arrowCount),
      link: arrowLink.subarray(0, arrowCount),
    },
    depends: arrows || looped || routed ? 'scale' : curved ? 'aspect' : 'none',
    scaleX: sx,
    scaleY: sy,
  };
}

/**
 * `geometry` with the links `links` (ascending) placed again from `input`: what a frame costs in
 * which a few nodes moved and nothing else changed (a node dragged). `links` are the links the
 * move changes: those of the moved nodes, and the loops of their neighbours (a loop points away
 * from its node's neighbours). Only those links are built;
 * their vertices and arrowheads are written over the old ones **in place**, and the result is a
 * new object over the same arrays (so that what is kept per geometry, the hover index, is made
 * again). `undefined` when a link no longer has as many vertices or arrowheads as before (it
 * got or lost its room between two nodes): the caller builds everything then.
 */
export function patchLinkGeometry(
  geometry: LinkGeometry,
  input: LinkGeometryInput,
  links: readonly number[],
): LinkGeometry | undefined {
  const count = input.source.length;
  if (geometry.offsets.length !== count + 1) return undefined;
  if (links.length === 0) return { ...geometry };
  // Every other link is skipped, with those the input leaves out anyway.
  const skip = new Uint8Array(count).fill(1);
  for (const k of links) if (input.skip?.[k] !== 1) skip[k] = 0;
  const part = buildLinkGeometry({ ...input, skip });
  const { arrows } = geometry;
  /** The first arrowhead of link `k` or of a later link. */
  const firstArrow = (list: Uint32Array, k: number): number => {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid]! < k) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const headsOf = (list: Uint32Array, from: number, k: number): number => {
    let n = 0;
    while (from + n < list.length && list[from + n] === k) n++;
    return n;
  };
  // First see that everything fits, then write: a patch that gives up leaves the arrays alone.
  for (const k of links) {
    if (
      part.offsets[k + 1]! - part.offsets[k]! !==
      geometry.offsets[k + 1]! - geometry.offsets[k]!
    ) {
      return undefined;
    }
    const a = firstArrow(arrows.link, k);
    const b = firstArrow(part.arrows.link, k);
    if (headsOf(arrows.link, a, k) !== headsOf(part.arrows.link, b, k)) return undefined;
  }
  // The arrays may be views of larger buffers the line primitive does not see: written through
  // the views, they are the same memory.
  for (const k of links) {
    const to = geometry.offsets[k]!;
    const from = part.offsets[k]!;
    const n = part.offsets[k + 1]! - from;
    geometry.x.set(part.x.subarray(from, from + n), to);
    geometry.y.set(part.y.subarray(from, from + n), to);
    const a = firstArrow(arrows.link, k);
    const b = firstArrow(part.arrows.link, k);
    for (let h = headsOf(arrows.link, a, k) - 1; h >= 0; h--) {
      arrows.x[a + h] = part.arrows.x[b + h]!;
      arrows.y[a + h] = part.arrows.y[b + h]!;
      arrows.angle[a + h] = part.arrows.angle[b + h]!;
    }
  }
  return { ...geometry };
}

/** Whether geometry built for one pair of scales has to be rebuilt for another. */
export function geometryStale(geometry: LinkGeometry, scaleX: number, scaleY: number): boolean {
  if (geometry.depends === 'none') return false;
  const rx = scaleX / geometry.scaleX;
  const ry = scaleY / geometry.scaleY;
  if (!Number.isFinite(rx) || !Number.isFinite(ry)) return false;
  // Half a percent is under a third of a pixel on a 60 px loop or arrow offset.
  if (geometry.depends === 'aspect') return Math.abs(rx / ry - 1) > 0.005;
  return Math.abs(rx - 1) > 0.005 || Math.abs(ry - 1) > 0.005;
}

/**
 * Squared distance in px from a screen point to link `k`'s path, and the nearest point on it (in
 * linear coordinates). `Infinity` for a link that is not drawn.
 */
export function distanceToLink(
  geometry: LinkGeometry,
  k: number,
  px: number,
  py: number,
  transform: { scaleX: number; scaleY: number; offsetX: number; offsetY: number },
  out?: { x: number; y: number },
): number {
  const a = geometry.offsets[k]!;
  const b = geometry.offsets[k + 1]!;
  let best = Infinity;
  for (let i = a; i + 1 < b; i++) {
    const x0 = geometry.x[i]! * transform.scaleX + transform.offsetX;
    const y0 = geometry.y[i]! * transform.scaleY + transform.offsetY;
    const x1 = geometry.x[i + 1]! * transform.scaleX + transform.offsetX;
    const y1 = geometry.y[i + 1]! * transform.scaleY + transform.offsetY;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((px - x0) * dx + (py - y0) * dy) / len2)) : 0;
    const qx = x0 + t * dx;
    const qy = y0 + t * dy;
    const d2 = (px - qx) * (px - qx) + (py - qy) * (py - qy);
    if (d2 < best) {
      best = d2;
      if (out) {
        out.x = geometry.x[i]! + t * (geometry.x[i + 1]! - geometry.x[i]!);
        out.y = geometry.y[i]! + t * (geometry.y[i + 1]! - geometry.y[i]!);
      }
    }
  }
  return best;
}

/**
 * `geometry` as two: the links `mask` marks, and the others. Each half has the vertices of its
 * links only and is otherwise shaped like the whole (`offsets` by link, empty for the links of
 * the other half), so that styles are spread over it the same way. The arrowheads stay with the
 * whole: they are one marker set.
 */
export function splitGeometry(
  geometry: LinkGeometry,
  mask: Uint8Array,
): { rest: LinkGeometry; marked: LinkGeometry } {
  const links = geometry.offsets.length - 1;
  const half = (want: number): LinkGeometry => {
    let vertices = 0;
    for (let k = 0; k < links; k++) {
      if ((mask[k] === 1 ? 1 : 0) === want)
        vertices += geometry.offsets[k + 1]! - geometry.offsets[k]!;
    }
    const x = new Float64Array(vertices);
    const y = new Float64Array(vertices);
    const offsets = new Uint32Array(links + 1);
    const starts: number[] = [];
    let count = 0;
    for (let k = 0; k < links; k++) {
      offsets[k] = count;
      if ((mask[k] === 1 ? 1 : 0) !== want) continue;
      const a = geometry.offsets[k]!;
      const b = geometry.offsets[k + 1]!;
      if (b === a) continue;
      if (count > 0) starts.push(count);
      x.set(geometry.x.subarray(a, b), count);
      y.set(geometry.y.subarray(a, b), count);
      count += b - a;
    }
    offsets[links] = count;
    return { ...geometry, x, y, starts: Uint32Array.from(starts), offsets };
  };
  return { rest: half(0), marked: half(1) };
}
