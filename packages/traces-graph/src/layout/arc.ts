/**
 * The `arc` arrangement (ADR-029): an arc diagram. Every node sits on one straight line and every
 * link is a half circle over (or under) it, so the order of the nodes is the whole drawing: a good
 * order shows clusters as bundles of short arcs, a bad one as a wall of long ones. Pure: typed
 * arrays in, typed arrays out; the same input gives the same output everywhere.
 *
 * The layout works in a "line frame": `along` runs along the node line from the first node to the
 * last, `across` is the side the arcs rise to. `orientation: 'h'` draws the frame as it is (line
 * along x, arcs above it, towards +y). `orientation: 'v'` is the same drawing turned a quarter
 * turn clockwise: the line runs along y with the first node at the top, and "above" becomes the
 * **right** side (+x), "below" the left. A turn, not a mirror image, so in both orientations a link
 * drawn "above" runs clockwise from the earlier node to the later one.
 *
 * Steps:
 * 1. order the nodes (`order`): input order, by group, by degree, or by barycenter sweeps;
 * 2. place them along the line in that order: neighbours are apart by their real extents along the
 *    line (`halfWidth` for `'h'`, `halfHeight` for `'v'`) plus `nodesep` (plus `groupsep` where
 *    the group changes, with `order: 'group'`), then the whole line is centred on the origin: the
 *    middle of its extent is at 0 along the line and the line is at 0 across it;
 * 3. route every link as a half circle whose diameter is the segment between the two node centres,
 *    on the side `sides` says, flattened to a half ellipse where it would rise above `maxHeight`.
 *
 * Barycenter order: starting from input order, each sweep moves every node **halfway** towards the
 * weighted mean position of its neighbours, then ranks the nodes again by where they landed (ties
 * keep their previous order). Moving all the way, the textbook step, swaps the two sides of every
 * chain or bipartite part back and forth without ever settling; the half step keeps a node's own
 * place in the balance and converges. The order with the smallest `span` seen is kept, input order
 * included, so the result is never worse than input order by that measure. It is a heuristic, not
 * a minimum, and it spreads like diffusion: a node moves a limited way per sweep, so a graph of
 * thousands of nodes in a bad order keeps gaining from more sweeps than the default.
 *
 * `span` is Σ weight · |rank(source) − rank(target)|: the total arc length counted in positions
 * (not px, so it does not change with node sizes or spacing).
 *
 * Routes are cubic Bézier chains from the link's source to its target: two segments per half
 * circle (7 points), with the quarter-circle constant {@link ARC_KAPPA}, which stays within 0.03 %
 * of the true radius.
 * - Parallel links share one arc (the same points, one route object each); so do a link and its
 *   reverse, run in the two directions, unless `sides: 'direction'` puts them on the two sides.
 * - A self-link is a small closed loop at its node (one segment, 4 points, starting and ending at
 *   the node centre), on the same side as the arcs (above for `sides: 'direction'`): it rises
 *   `loopSize` beyond the node's edge and is half as wide as it is tall. `maxHeight` does not cap
 *   it. With `loopSize: 0` self-links get no route.
 * - A link with an end that is not a node (the contract rules them out) is ignored: no route.
 */
import type { LayoutGraph, LayoutResult, LinkRoute } from './types.ts';

/** How {@link arcLayout} orders the nodes along the line. */
export type ArcOrder = 'input' | 'group' | 'degree' | 'barycenter';

/** Which side of the line the arcs are drawn on. */
export type ArcSides = 'above' | 'below' | 'direction';

/** Options of {@link arcLayout}. Lengths are layout units (CSS px). */
export interface ArcLayoutOptions {
  /**
   * Direction of the node line: `'h'` along x, first node on the left; `'v'` along y, first node
   * at the top. Default `'h'`.
   */
  readonly orientation?: 'h' | 'v';
  /**
   * Order of the nodes along the line. `'input'`: by node index. `'group'`: by `graph.group`,
   * ungrouped nodes last, index order within a group (input order when the graph has no groups).
   * `'degree'`: most links first (a self-link counts twice), ties by index. `'barycenter'`: input
   * order improved by `sweeps` barycenter sweeps (see the module comment). Default `'input'`.
   */
  readonly order?: ArcOrder;
  /** Space between neighbouring nodes, added to their extents along the line. Default 20. */
  readonly nodesep?: number;
  /**
   * Extra space where the group changes between two neighbours (also before the ungrouped nodes).
   * Only with `order: 'group'`. Default 0.
   */
  readonly groupsep?: number;
  /** Number of barycenter sweeps at most (it stops when a sweep changes nothing). Default 8. */
  readonly sweeps?: number;
  /**
   * Side of the arcs. `'above'`: +y for `'h'`, +x (right) for `'v'`. `'below'`: the other side.
   * `'direction'`: above, but a link whose target comes before its source in the order goes
   * below, so every arc runs clockwise from its source to its target. Default `'above'`.
   */
  readonly sides?: ArcSides;
  /**
   * Cap on how far an arc rises from the line: an arc between nodes more than twice this apart is
   * a half ellipse of this height. Default: none (half circles).
   */
  readonly maxHeight?: number;
  /**
   * How far a self-link's loop rises beyond the edge of its node (the node's extent across the
   * line). 0: self-links get no route. Default 12.
   */
  readonly loopSize?: number;
}

/** What {@link arcLayout} returns: the positions and routes, and the order it chose. */
export interface ArcLayoutResult extends LayoutResult {
  /**
   * One entry per link: a `'spline'` route for every link between two nodes (7 points, or 4 for a
   * self-link's loop), `undefined` for a self-link when `loopSize` is 0.
   */
  readonly routes: readonly (LinkRoute | undefined)[];
  /** The node at each position along the line, first to last. */
  readonly order: Int32Array;
  /** The position of each node along the line (the inverse of `order`). */
  readonly rank: Int32Array;
  /** Σ weight · |rank(source) − rank(target)| of the order: what `'barycenter'` reduces. */
  readonly span: number;
}

/**
 * The control-point distance that makes a cubic Bézier closest to a quarter circle of radius 1:
 * 4/3 · (√2 − 1) ≈ 0.5523.
 */
export const ARC_KAPPA = (4 / 3) * (Math.SQRT2 - 1);

const number = (v: unknown, dflt: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : dflt;

/** A node's half extent as given, 0 when it is missing, negative or not finite. */
const extent = (v: number | undefined): number =>
  v !== undefined && v > 0 && v < Infinity ? v : 0;

/** Both ends of a link are nodes. */
const isLink = (s: number | undefined, t: number | undefined, n: number): boolean =>
  s !== undefined && t !== undefined && s >= 0 && s < n && t >= 0 && t < n;

/** A link's weight as given, 1 when it is missing, not positive or not finite. */
const weightOf = (w: number | undefined): number =>
  w !== undefined && w > 0 && w < Infinity ? w : 1;

function identity(n: number): Int32Array {
  const out = new Int32Array(n);
  for (let i = 0; i < n; i++) out[i] = i;
  return out;
}

/** A node's group for sorting and for `groupsep`: ungrouped nodes are one class after the others. */
const groupKey = (group: Int32Array, i: number): number => {
  const g = group[i];
  return g === undefined || g < 0 ? Infinity : g;
};

/** Σ weight · |rank(source) − rank(target)|. */
function spanOf(graph: LayoutGraph, rank: Int32Array): number {
  const n = graph.nodes;
  let sum = 0;
  for (let k = 0; k < graph.source.length; k++) {
    const s = graph.source[k];
    const t = graph.target[k];
    if (!isLink(s, t, n)) continue;
    sum += weightOf(graph.weight[k]) * Math.abs(rank[s!]! - rank[t!]!);
  }
  return sum;
}

/** Nodes by degree, highest first, ties by index. A self-link counts twice, as in graph theory. */
function degreeOrder(graph: LayoutGraph): Int32Array {
  const n = graph.nodes;
  const degree = new Int32Array(n);
  for (let k = 0; k < graph.source.length; k++) {
    const s = graph.source[k];
    const t = graph.target[k];
    if (!isLink(s, t, n)) continue;
    degree[s!]!++;
    degree[t!]!++;
  }
  return identity(n).sort((a, b) => degree[b]! - degree[a]! || a - b);
}

/** Nodes by group, ungrouped last, index order within a group. */
function groupOrder(graph: LayoutGraph): Int32Array {
  const order = identity(graph.nodes);
  const group = graph.group;
  if (!group) return order;
  // `Infinity − Infinity` is NaN, which is falsy: two ungrouped nodes fall through to their index.
  return order.sort((a, b) => groupKey(group, a) - groupKey(group, b) || a - b);
}

/**
 * Input order improved by barycenter sweeps (see the module comment): the order with the smallest
 * span among input order and the order after each sweep, the earliest one when several tie.
 */
function barycenterOrder(graph: LayoutGraph, sweeps: number): Int32Array {
  const n = graph.nodes;
  const links = graph.source.length;
  const order = identity(n);
  const rank = identity(n);
  const best = identity(n);
  let bestSpan = spanOf(graph, rank);
  // Total weight of each node's links to other nodes: the same in every sweep.
  const total = new Float64Array(n);
  for (let k = 0; k < links; k++) {
    const s = graph.source[k];
    const t = graph.target[k];
    if (!isLink(s, t, n) || s === t) continue;
    const w = weightOf(graph.weight[k]);
    total[s!]! += w;
    total[t!]! += w;
  }
  const pull = new Float64Array(n);
  const key = new Float64Array(n);
  for (let sweep = 0; sweep < sweeps && bestSpan > 0; sweep++) {
    pull.fill(0);
    for (let k = 0; k < links; k++) {
      const s = graph.source[k];
      const t = graph.target[k];
      if (!isLink(s, t, n) || s === t) continue;
      const w = weightOf(graph.weight[k]);
      pull[s!]! += w * rank[t!]!;
      pull[t!]! += w * rank[s!]!;
    }
    // Halfway to the mean position of the neighbours; a node without neighbours stays.
    for (let i = 0; i < n; i++) {
      const r = rank[i]!;
      key[i] = total[i]! > 0 ? (r + pull[i]! / total[i]!) / 2 : r;
    }
    order.sort((a, b) => key[a]! - key[b]! || rank[a]! - rank[b]!);
    let moved = false;
    for (let p = 0; p < n; p++) {
      const i = order[p]!;
      if (rank[i] !== p) moved = true;
      rank[i] = p;
    }
    if (!moved) break;
    const span = spanOf(graph, rank);
    if (span < bestSpan) {
      bestSpan = span;
      best.set(order);
    }
  }
  return best;
}

/**
 * An arc diagram of `graph`: nodes on one line through the origin, links as half circles. See the
 * module comment for the steps and for what happens to self-links and parallel links.
 */
export function arcLayout(graph: LayoutGraph, options: ArcLayoutOptions = {}): ArcLayoutResult {
  const n = graph.nodes;
  const links = graph.source.length;
  const vertical = options.orientation === 'v';
  const nodesep = Math.max(0, number(options.nodesep, 20));
  const groupsep = Math.max(0, number(options.groupsep, 0));
  const sweeps = Math.max(0, Math.floor(number(options.sweeps, 8)));
  const loopSize = Math.max(0, number(options.loopSize, 12));
  const cap = options.maxHeight;
  const maxHeight = typeof cap === 'number' && cap >= 0 ? cap : Infinity;
  const sides = options.sides;

  // 1. The order, and its inverse.
  const order =
    options.order === 'group'
      ? groupOrder(graph)
      : options.order === 'degree'
        ? degreeOrder(graph)
        : options.order === 'barycenter'
          ? barycenterOrder(graph, sweeps)
          : identity(n);
  const rank = new Int32Array(n);
  for (let p = 0; p < n; p++) rank[order[p]!] = p;

  // 2. Centres along the line, by node; then the middle of the line's extent moves to 0.
  const alongExtent = vertical ? graph.halfHeight : graph.halfWidth;
  const acrossExtent = vertical ? graph.halfWidth : graph.halfHeight;
  const group = options.order === 'group' && groupsep > 0 ? graph.group : undefined;
  const along = new Float64Array(n);
  let cursor = 0;
  for (let p = 0; p < n; p++) {
    const i = order[p]!;
    const e = extent(alongExtent[i]);
    if (p > 0) {
      cursor += nodesep;
      if (group && groupKey(group, order[p - 1]!) !== groupKey(group, i)) cursor += groupsep;
    }
    cursor += e;
    along[i] = cursor;
    cursor += e;
  }
  const middle = cursor / 2;
  for (let i = 0; i < n; i++) along[i]! -= middle;

  // A point of the line frame in the drawing. `0 −` and `+ 0` keep −0 out of the output.
  const put = (points: Float64Array, j: number, a: number, c: number): void => {
    points[2 * j] = vertical ? c + 0 : a + 0;
    points[2 * j + 1] = vertical ? 0 - a : c + 0;
  };
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (vertical) y[i] = 0 - along[i]!;
    else x[i] = along[i]!;
  }

  // 3. Routes.
  const routes: (LinkRoute | undefined)[] = new Array<LinkRoute | undefined>(links).fill(undefined);
  for (let k = 0; k < links; k++) {
    const s = graph.source[k];
    const t = graph.target[k];
    if (!isLink(s, t, n)) continue;
    const a0 = along[s!]!;
    const a1 = along[t!]!;
    const below = sides === 'below' || (sides === 'direction' && rank[t!]! < rank[s!]!);
    const side = below ? -1 : 1;
    if (s === t) {
      if (loopSize <= 0) continue;
      // A cubic that leaves and comes back to one point is a teardrop: with the two control
      // points at height H and ±w, its top is at 3/4 · H and its half width is √3/6 · w. So for a
      // top at `top` and a half width of `top / 2`: H = 4/3 · top and w = √3 · top.
      const top = extent(acrossExtent[s!]) + loopSize;
      const w = side * Math.sqrt(3) * top;
      const h = ((side * 4) / 3) * top;
      const points = new Float64Array(8);
      put(points, 0, a0, 0);
      put(points, 1, a0 - w, h);
      put(points, 2, a0 + w, h);
      put(points, 3, a0, 0);
      routes[k] = { points, kind: 'spline' };
      continue;
    }
    // Half an ellipse with the node distance as one axis: a half circle unless `maxHeight` caps it.
    const half = (a1 - a0) / 2;
    const mid = (a0 + a1) / 2;
    const h = side * Math.min(Math.abs(half), maxHeight);
    const points = new Float64Array(14);
    put(points, 0, a0, 0);
    put(points, 1, a0, ARC_KAPPA * h);
    put(points, 2, mid - ARC_KAPPA * half, h);
    put(points, 3, mid, h);
    put(points, 4, mid + ARC_KAPPA * half, h);
    put(points, 5, a1, ARC_KAPPA * h);
    put(points, 6, a1, 0);
    routes[k] = { points, kind: 'spline' };
  }

  return { x, y, routes, order, rank, span: spanOf(graph, rank) };
}
