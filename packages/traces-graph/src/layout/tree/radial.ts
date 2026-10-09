/**
 * Radial tree layout (backlog G4): the root in the centre, each level on a ring around it, a
 * subtree in its own wedge.
 *
 * ## Which radial tree
 *
 * This is the **tidy tree bent round**: the same contour pass as `tidy.ts` (`buchheim.ts`), run on
 * angles instead of lengths. The other common choice, giving each subtree a wedge in proportion to
 * its leaves, is simpler but wasteful: a few deep leaves and many shallow ones get the same slice
 * each, so the crowded outer ring sets the size of the whole drawing. The tidy pass lets a shallow
 * subtree tuck in beside a deep one, keeps parents centred over their children and reuses code
 * that is already tested.
 *
 * ## Steps
 *
 * 1. Rings get a first radius: each is `ranksep` beyond the one before, plus the reach of the
 *    largest nodes of the two (a node's reach is half its diagonal, so the layout holds for
 *    markers and boxes alike). A single root is the centre; the roots of a forest share the first
 *    ring around a centre that is not drawn.
 * 2. The tidy pass runs with the separation of two neighbours measured as the **angle** their
 *    sizes plus `nodesep` (`subtreesep` between subtrees) take up on their ring: `2·asin(s / 2r)`.
 *    Inner rings are tight, so their nodes ask for more angle, as they should.
 * 3. The angles are scaled to fill the `sector`, the drawing centred in it. On a full circle, or a
 *    sector too wide to leave it, room is kept between the last node of every ring and the first.
 * 4. With the angles fixed, each ring is pushed out as far as its closest pair of neighbours needs
 *    (their chord must be at least their sizes plus the separation), and never closer to the ring
 *    inside it than step 1 allows. When the tree fits the sector, nothing moves and the rings are
 *    evenly spaced; when it does not, the crowded rings grow.
 *
 * So neighbours on a ring never overlap, and neither do nodes of different rings. Two nodes of one
 * ring with others between them can only touch when they are about as large as the ring itself.
 *
 * ## Link routes
 *
 * Routes join node centers. `'curved'` is one cubic Bézier per tree edge that leaves the parent and
 * reaches the child along their radii (control points on the ring halfway between: d3's
 * `linkRadial`). `'elbow'` goes out along the parent's radius to the middle of the gap between the
 * two rings, round an arc to the child's angle and out to the child; the arc is a chain of cubic
 * Béziers, so the route is a `'spline'` too. Links from a root in the centre, and from a parent to
 * a child on the same radius (`'elbow'`), are straight and have no route.
 */
import type { LayoutGraph, LinkRoute } from '../types.ts';
import { tidyBreadth } from './buchheim.ts';
import {
  halfExtents,
  lengthOption,
  linkRoutes,
  parkHidden,
  treeFields,
  type TreeLayoutResult,
  type TreeOptions,
} from './common.ts';
import { buildForest, viewForest } from './forest.ts';
import type { TreeLinkShape } from './tidy.ts';

/** Options of {@link radialTreeLayout}. Lengths are layout units (CSS px), angles degrees. */
export interface RadialTreeOptions extends TreeOptions {
  /** Room between two siblings on a ring, on top of their sizes. Default 20. */
  readonly nodesep?: number;
  /** Room between two neighbours on a ring that are not siblings. Default: `nodesep`. */
  readonly subtreesep?: number;
  /** Room between two rings, on top of their largest nodes. Default 50. */
  readonly ranksep?: number;
  /**
   * The part of the circle the tree fans out over: `start` is the angle it begins at and `span`
   * how far it goes, in degrees, counter-clockwise from the +x axis (3 o'clock), y up. A negative
   * `span` runs clockwise. Default `{ start: 0, span: 360 }`.
   */
  readonly sector?: { readonly start?: number; readonly span?: number };
  /** Shape of the tree edges: see the file header. Default `'straight'`. */
  readonly links?: TreeLinkShape;
}

/** What {@link radialTreeLayout} returns. */
export interface RadialTreeResult extends TreeLayoutResult {
  /**
   * Polar position of each node about the origin: `angle` in degrees counter-clockwise from +x,
   * `radius` in layout units (0 for a root in the centre). For labels turned along the radius.
   */
  readonly angle: Float64Array;
  readonly radius: Float64Array;
}

const TAU = 2 * Math.PI;

/** The angle a length `s` takes up as a chord of a circle of radius `r` (π when it does not fit). */
function chordAngle(s: number, r: number): number {
  if (s <= 0) return 0;
  return s >= 2 * r ? Math.PI : 2 * Math.asin(s / (2 * r));
}

/** Lays a tree or forest out on rings around its root. Linear in nodes + links (sorting aside). */
export function radialTreeLayout(
  graph: LayoutGraph,
  options: RadialTreeOptions = {},
): RadialTreeResult {
  const forest = buildForest(graph);
  const view = viewForest(forest, graph, options);
  const n = forest.nodes;
  const { parent, depth } = forest;
  const { order } = view;
  const nodesep = lengthOption(options.nodesep, 20);
  const subtreesep = lengthOption(options.subtreesep, nodesep);
  const ranksep = lengthOption(options.ranksep, 50);

  const halfWidth = halfExtents(graph.halfWidth, n);
  const reach = halfExtents(graph.halfHeight, n);
  for (let i = 0; i < n; i++) reach[i] = Math.hypot(halfWidth[i]!, reach[i]!);

  // Step 1: rings. A forest's roots are on ring 1.
  const ringShift = view.roots.length > 1 ? 1 : 0;
  let rings = ringShift;
  for (let s = 0; s < order.length; s++) rings = Math.max(rings, depth[order[s]!]! + ringShift + 1);
  const ringReach = new Float64Array(rings);
  const firstOn = new Int32Array(rings).fill(-1);
  const lastOn = new Int32Array(rings).fill(-1);
  for (let s = 0; s < order.length; s++) {
    const v = order[s]!;
    const d = depth[v]! + ringShift;
    if (reach[v]! > ringReach[d]!) ringReach[d] = reach[v]!;
    if (firstOn[d]! < 0) firstOn[d] = v;
    lastOn[d] = v;
  }
  const ringGap = (d: number): number => ringReach[d - 1]! + ranksep + ringReach[d]!;
  const ringAt = new Float64Array(rings);
  for (let d = 1; d < rings; d++) ringAt[d] = ringAt[d - 1]! + ringGap(d);

  // Step 2: the tidy pass on angles.
  const room = (a: number, b: number): number =>
    reach[a]! + reach[b]! + (parent[a]! >= 0 && parent[a] === parent[b] ? nodesep : subtreesep);
  const turn = tidyBreadth(view, (a, b) => chordAngle(room(a, b), ringAt[depth[a]! + ringShift]!));

  // Step 3: scale to the sector. `closed` is the angle the widest ring needs to close on itself.
  let t0 = Infinity;
  let t1 = -Infinity;
  let closed = 0;
  for (let d = 1; d < rings; d++) {
    const a = firstOn[d]!;
    const b = lastOn[d]!;
    if (a < 0) continue;
    t0 = Math.min(t0, turn[a]!);
    t1 = Math.max(t1, turn[b]!);
    if (a !== b) {
      closed = Math.max(closed, turn[b]! - turn[a]! + chordAngle(room(b, a), ringAt[d]!));
    }
  }
  const width = t1 > t0 ? t1 - t0 : 0;
  const startOption = options.sector?.start;
  const spanOption = options.sector?.span;
  const start = ((Number.isFinite(startOption) ? startOption! : 0) * Math.PI) / 180;
  const spanDegrees = Number.isFinite(spanOption) && spanOption !== 0 ? spanOption! : 360;
  const span = (Math.min(360, Math.abs(spanDegrees)) * Math.PI) / 180;
  const direction = spanDegrees < 0 ? -1 : 1;
  const scale = width > 0 ? Math.min(span / width, TAU / Math.max(width, closed)) : 0;
  const inset = (span - width * scale) / 2;
  const angleOf = (v: number): number =>
    start + direction * (inset + (width > 0 ? turn[v]! - t0 : 0) * scale);

  // Step 4: push each ring out until its closest neighbours clear each other.
  const need = new Float64Array(rings);
  const clear = (d: number, s: number, between: number): void => {
    const half = Math.sin(between / 2);
    if (s > 0 && half > 1e-12) need[d] = Math.max(need[d]!, s / (2 * half));
  };
  const previousOn = new Int32Array(rings).fill(-1);
  for (let s = 0; s < order.length; s++) {
    const v = order[s]!;
    const d = depth[v]! + ringShift;
    const u = previousOn[d]!;
    previousOn[d] = v;
    if (d > 0 && u >= 0) clear(d, room(u, v), (turn[v]! - turn[u]!) * scale);
  }
  for (let d = 1; d < rings; d++) {
    const a = firstOn[d]!;
    const b = lastOn[d]!;
    if (a >= 0 && a !== b) clear(d, room(b, a), TAU - (turn[b]! - turn[a]!) * scale);
    ringAt[d] = Math.max(ringAt[d - 1]! + ringGap(d), need[d]!);
  }

  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const angle = new Float64Array(n);
  const radius = new Float64Array(n);
  for (let s = 0; s < order.length; s++) {
    const v = order[s]!;
    const a = angleOf(v);
    const r = ringAt[depth[v]! + ringShift]!;
    angle[v] = a;
    radius[v] = r;
    // `+ 0`: no negative zeros in the output.
    x[v] = r * Math.cos(a) + 0;
    y[v] = r * Math.sin(a) + 0;
  }

  const shape = options.links;
  let parentRoutes: (LinkRoute | undefined)[] | undefined;
  if (shape === 'curved' || shape === 'elbow') {
    parentRoutes = new Array<LinkRoute | undefined>(n).fill(undefined);
    for (let s = 0; s < order.length; s++) {
      const v = order[s]!;
      const p = parent[v]!;
      if (p < 0 || radius[p]! <= 0) continue;
      if (shape === 'curved') {
        parentRoutes[v] = curvedRoute(angle[p]!, radius[p]!, angle[v]!, radius[v]!);
      } else if (angle[p] !== angle[v]) {
        const d = depth[v]! + ringShift;
        const bar = (ringAt[d - 1]! + ringReach[d - 1]! + ringAt[d]! - ringReach[d]!) / 2;
        parentRoutes[v] = elbowRoute(angle[p]!, radius[p]!, angle[v]!, radius[v]!, bar);
      }
    }
  }

  // Hidden nodes sit on their ancestor; angles leave here in degrees.
  parkHidden(view, x, y);
  parkHidden(view, angle, radius);
  for (let i = 0; i < n; i++) angle[i]! *= 180 / Math.PI;

  const fields = { x, y, angle, radius, ...treeFields(view) };
  if (!parentRoutes) return fields;
  return { ...fields, routes: linkRoutes(graph, forest, parentRoutes), parentRoutes };
}

/** One cubic from (a0, r0) to (a1, r1), polar, with both control points on the ring halfway. */
function curvedRoute(a0: number, r0: number, a1: number, r1: number): LinkRoute {
  const middle = (r0 + r1) / 2;
  return {
    kind: 'spline',
    points: Float64Array.of(
      r0 * Math.cos(a0),
      r0 * Math.sin(a0),
      middle * Math.cos(a0),
      middle * Math.sin(a0),
      middle * Math.cos(a1),
      middle * Math.sin(a1),
      r1 * Math.cos(a1),
      r1 * Math.sin(a1),
    ),
  };
}

/**
 * Out along angle `a0` from radius `r0` to `bar`, round the circle of radius `bar` to angle `a1`,
 * out to radius `r1`: a chain of cubics (the straight parts as cubics with evenly spaced control
 * points, the arc in pieces of a quarter turn at most).
 */
function elbowRoute(a0: number, r0: number, a1: number, r1: number, bar: number): LinkRoute {
  const sweep = a1 - a0;
  const pieces = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9));
  const points = new Float64Array(2 * (3 * (pieces + 2) + 1));
  let at = 0;
  const put = (px: number, py: number): void => {
    points[at++] = px;
    points[at++] = py;
  };
  const line = (a: number, from: number, to: number): void => {
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    for (let i = 1; i <= 3; i++) {
      const r = from + ((to - from) * i) / 3;
      put(r * cos, r * sin);
    }
  };
  put(r0 * Math.cos(a0), r0 * Math.sin(a0));
  line(a0, r0, bar);
  const step = sweep / pieces;
  // Control points of a circular arc of angle `step`: this far along the tangents at its ends.
  const handle = (4 / 3) * Math.tan(step / 4) * bar;
  for (let i = 0; i < pieces; i++) {
    const from = a0 + i * step;
    const to = i === pieces - 1 ? a1 : from + step;
    put(
      bar * Math.cos(from) - handle * Math.sin(from),
      bar * Math.sin(from) + handle * Math.cos(from),
    );
    put(bar * Math.cos(to) + handle * Math.sin(to), bar * Math.sin(to) - handle * Math.cos(to));
    put(bar * Math.cos(to), bar * Math.sin(to));
  }
  line(a1, bar, r1);
  return { points, kind: 'spline' };
}
