/**
 * Hierarchical edge bundling (Holten 2006) for graphs whose nodes are in groups or in a tree: each
 * link is drawn as a smooth curve along the path that joins its two ends in the hierarchy, so
 * links between the same two groups run together as one bundle and the picture shows which groups
 * talk to which instead of a hairball. Pure: typed arrays in, routes out, the same input gives the
 * same bytes everywhere (only `+ − × ÷`).
 *
 * It works for any node positions, because the bundles go through the centroids of the groups as
 * they are placed. It is at its best on circular and radial arrangements with the groups next to
 * each other on the circle: there the centroids lie inside the circle and the bundles cross its
 * middle. On a force layout the groups overlap and so do the bundles. The cost is linear in
 * links × depth of the hierarchy (plus nodes × depth to build it): 200,000 links take a fraction
 * of a second.
 *
 * ## The hierarchy
 *
 * `hierarchy: 'groups'` (the default when the graph has groups): node → its group (`graph.group`)
 * → the group's parent group (`groupParent`, optional, any depth) → one root. The point of a group
 * is the centroid of the positions of the nodes below it, nested groups included; the root's point
 * is the centroid of all nodes, which is the centre of the circle for a circular arrangement.
 * A node without a group (`-1`, or an index that is not a group) hangs directly under the root.
 *
 * `hierarchy: 'parents'` (the default when the graph only has `parent`): the hierarchy is over the
 * nodes themselves (`graph.parent`), and the point of an ancestor is that node's own position. With
 * several roots, a virtual root at the centroid of the roots joins them.
 *
 * Nodes without a finite position do not count toward a centroid. A cycle in `groupParent` or in
 * `parent` is cut at the entry that closes it, walking from the lowest index: that group or node
 * becomes a top-level one.
 *
 * ## A link's curve
 *
 * 1. The path: the source, its ancestors up to the lowest common ancestor of the two ends, down to
 *    the target. With one level of groups a link between two groups has 5 points (node, group
 *    centroid, centre, other group centroid, node) and a link inside a group has 3 (node, centroid,
 *    node). An ancestor without a finite point (a `'parents'` ancestor that has no position) is
 *    left out of the path.
 * 2. The control polygon: the path's points, straightened by `beta = strength`:
 *    `P'_i = beta · P_i + (1 − beta) · (P_0 + i / (N − 1) · (P_N−1 − P_0))`. At 1 the polygon is
 *    the path; at 0 it is the straight link. The two ends never move.
 * 3. The curve: the clamped B-spline of the polygon as cubic Bézier pieces (`./bspline.ts`): one
 *    piece for 3 or 4 points, `N − 3` pieces for more.
 *
 * Paths of 3 points bend less: their `beta` is `strength × sameGroupStrength`. That is every link
 * whose two ends have the same parent: two nodes of one group, two children of one node, and also
 * two nodes without a group, whose common parent is the root (they bend toward the centre). In
 * `'parents'` mode a node and its grandparent have a path of 3 points too.
 *
 * These links stay straight (`undefined`): a self-link; a link with an end that is not a node or
 * has no finite position; a link whose path has 2 points (a node and its own parent in `'parents'`
 * mode, or a longer chain whose ancestors in between have no position); any link when its `beta`
 * is 0.
 *
 * A group with a single node has its centroid on that node, so the path has the same point twice
 * there; the curve is still smooth, it only leaves that node a little straighter.
 */
import type { LinkRoute } from '../types.ts';
import { bsplineToBezier } from './bspline.ts';
import { DEFAULT_BUNDLE_STRENGTH, unit, type BundleGraph, type BundlePositions } from './types.ts';

/** Options of {@link hierarchicalBundle}. */
export interface HierarchicalBundleOptions {
  /** 0 = straight links … 1 = the curve follows the hierarchy path fully. Default 0.85. */
  readonly strength?: number;
  /**
   * What the hierarchy is made of (see the module comment): `'groups'` reads `graph.group` (and
   * `groupParent`), `'parents'` reads `graph.parent`. Default: `'groups'` when the graph has
   * groups, else `'parents'` when it has `parent`. When the graph has neither, or not the one
   * asked for, nothing is bundled.
   */
  readonly hierarchy?: 'groups' | 'parents';
  /**
   * Parent group of each group, `-1` for a top-level group: a hierarchy of groups deeper than one
   * level. Only with `hierarchy: 'groups'`. Default: none (every group is top level).
   */
  readonly groupParent?: Int32Array;
  /**
   * Factor on `strength` for links whose path has 3 points (the two ends have the same parent),
   * 0 to 1, so that links inside a group bend less than links between groups. Default 0.5.
   */
  readonly sameGroupStrength?: number;
}

/** The tree {@link hierarchicalBundle} routes along: the graph's nodes, then groups, then a root. */
export interface BundleHierarchy {
  /** Number of graph nodes. Tree nodes `0 … nodes − 1` are the graph's nodes, in their order. */
  readonly nodes: number;
  /**
   * Parent of each tree node, `-1` for the root. With `'groups'`: tree node `nodes + g` is group
   * `g` and `nodes + groups` is the root. With `'parents'`: tree node `nodes` is the virtual root,
   * in use only when the graph has several roots.
   */
  readonly parent: Int32Array;
  /** Depth of each tree node: 0 for a root. */
  readonly depth: Int32Array;
  /** The point of each tree node: a node's position, a group's centroid. `NaN`: none. */
  readonly x: Float64Array;
  readonly y: Float64Array;
}

/** True when at least one node is in a group the graph has. */
export function hasGroups(graph: BundleGraph, nodes: number): boolean {
  const group = graph.group;
  const groups = graph.groups ?? 0;
  if (!group || !(groups > 0)) return false;
  const n = Math.min(nodes, group.length);
  for (let i = 0; i < n; i++) {
    const g = group[i]!;
    if (g >= 0 && g < groups) return true;
  }
  return false;
}

/**
 * `raw` as a forest over `count` items: each item's parent, `-1` for a root. An entry that is not
 * another item's index is a root, and a cycle is cut at the entry that closes it when the items
 * are walked from index 0 up.
 */
function forest(raw: Int32Array | undefined, count: number): Int32Array {
  const parent = new Int32Array(count).fill(-1);
  if (!raw) return parent;
  for (let i = 0; i < count; i++) {
    const p = raw[i];
    if (p !== undefined && p >= 0 && p < count && p !== i) parent[i] = p;
  }
  // 0: not seen, 1: on the chain being walked, 2: known to reach a root.
  const state = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    let a = i;
    while (state[a] === 0) {
      state[a] = 1;
      const p = parent[a]!;
      if (p < 0) break;
      if (state[p] === 1) {
        parent[a] = -1;
        break;
      }
      a = p;
    }
    for (let b = i; state[b] === 1; b = parent[b]!) {
      state[b] = 2;
      if (parent[b]! < 0) break;
    }
  }
  return parent;
}

/** Depths of a tree given as parents (`-1` for a root, no cycles): 0 for a root. */
function depths(parent: Int32Array): Int32Array {
  const size = parent.length;
  const depth = new Int32Array(size).fill(-1);
  for (let i = 0; i < size; i++) {
    if (depth[i]! >= 0) continue;
    // Up to the first ancestor with a known depth (or a root), then back down the same chain.
    let steps = 0;
    let a = i;
    while (depth[a]! < 0 && parent[a]! >= 0) {
      a = parent[a]!;
      steps++;
    }
    let d = (depth[a]! < 0 ? 0 : depth[a]!) + steps;
    for (let b = i; depth[b]! < 0; b = parent[b]!) {
      depth[b] = d--;
      if (parent[b]! < 0) break;
    }
  }
  return depth;
}

/**
 * The hierarchy {@link hierarchicalBundle} routes along, built as the module comment says, or
 * `undefined` when the graph has neither groups nor parents (or not the kind `hierarchy` asks
 * for). The number of nodes is the length of the positions.
 */
export function buildHierarchy(
  positions: BundlePositions,
  graph: BundleGraph,
  options: HierarchicalBundleOptions = {},
): BundleHierarchy | undefined {
  const n = Math.min(positions.x.length, positions.y.length);
  const grouped = hasGroups(graph, n);
  const mode = options.hierarchy ?? (grouped ? 'groups' : graph.parent ? 'parents' : undefined);
  const finite = (i: number): boolean => Number.isFinite(positions.x[i]! + positions.y[i]!);

  if (mode === 'groups') {
    if (!grouped) return undefined;
    const group = graph.group!;
    const groups = Math.floor(graph.groups!);
    const root = n + groups;
    const size = root + 1;
    const parent = new Int32Array(size).fill(root);
    parent[root] = -1;
    const above = forest(options.groupParent, groups);
    for (let g = 0; g < groups; g++) if (above[g]! >= 0) parent[n + g] = n + above[g]!;
    for (let i = 0; i < n; i++) {
      const g = group[i];
      if (g !== undefined && g >= 0 && g < groups) parent[i] = n + g;
    }
    // Centroids: every node adds its position to each of its ancestors, in node order.
    const x = new Float64Array(size);
    const y = new Float64Array(size);
    const count = new Int32Array(size);
    for (let i = 0; i < n; i++) {
      const px = positions.x[i]!;
      const py = positions.y[i]!;
      if (!finite(i)) {
        x[i] = NaN;
        y[i] = NaN;
        continue;
      }
      x[i] = px;
      y[i] = py;
      count[i] = 1;
      for (let a = parent[i]!; a >= 0; a = parent[a]!) {
        x[a]! += px;
        y[a]! += py;
        count[a]!++;
      }
    }
    for (let a = n; a < size; a++) {
      x[a] = count[a]! > 0 ? x[a]! / count[a]! : NaN;
      y[a] = count[a]! > 0 ? y[a]! / count[a]! : NaN;
    }
    return { nodes: n, parent, depth: depths(parent), x, y };
  }

  if (mode === 'parents') {
    if (!graph.parent) return undefined;
    const parent = new Int32Array(n + 1).fill(-1);
    parent.set(forest(graph.parent, n));
    const x = new Float64Array(n + 1);
    const y = new Float64Array(n + 1);
    let roots = 0;
    let placed = 0;
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < n; i++) {
      const ok = finite(i);
      x[i] = ok ? positions.x[i]! : NaN;
      y[i] = ok ? positions.y[i]! : NaN;
      if (parent[i]! >= 0) continue;
      roots++;
      if (ok) {
        placed++;
        sumX += x[i]!;
        sumY += y[i]!;
      }
    }
    x[n] = placed > 0 ? sumX / placed : NaN;
    y[n] = placed > 0 ? sumY / placed : NaN;
    // One root is the root; several hang under the virtual one.
    if (roots > 1) for (let i = 0; i < n; i++) if (parent[i]! < 0) parent[i] = n;
    return { nodes: n, parent, depth: depths(parent), x, y };
  }

  return undefined;
}

/**
 * The path between tree nodes `s` and `t` written to `into` (tree node indices: `s`, its
 * ancestors, the lowest common ancestor, down to `t`), leaving out ancestors without a finite
 * point. Returns the number of entries.
 */
function writePath(h: BundleHierarchy, s: number, t: number, into: Int32Array): number {
  const { parent, depth, x, y } = h;
  let count = 0;
  // The target's side is collected from the end of the buffer and moved down afterwards.
  let tail = into.length;
  let a = s;
  let b = t;
  const keep = (i: number): boolean => i === s || i === t || Number.isFinite(x[i]! + y[i]!);
  while (depth[a]! > depth[b]!) {
    if (keep(a)) into[count++] = a;
    a = parent[a]!;
  }
  while (depth[b]! > depth[a]!) {
    if (keep(b)) into[--tail] = b;
    b = parent[b]!;
  }
  while (a !== b && a >= 0 && b >= 0) {
    if (keep(a)) into[count++] = a;
    if (keep(b)) into[--tail] = b;
    a = parent[a]!;
    b = parent[b]!;
  }
  // The common ancestor; two trees that never meet (not built here) would have none.
  if (a === b && a >= 0 && keep(a)) into[count++] = a;
  while (tail < into.length) into[count++] = into[tail++]!;
  return count;
}

/** The longest path there can be: up from the deepest node and down again. */
function pathCapacity(h: BundleHierarchy): number {
  let deepest = 0;
  for (let i = 0; i < h.depth.length; i++) if (h.depth[i]! > deepest) deepest = h.depth[i]!;
  return 2 * deepest + 3;
}

/**
 * The path a link between nodes `s` and `t` takes through the hierarchy, as tree node indices (see
 * {@link BundleHierarchy}): `s`, its ancestors up to the lowest common ancestor, down to `t`.
 * Ancestors without a finite point are left out. Empty when `s` or `t` is not a node.
 */
export function hierarchyPath(h: BundleHierarchy, s: number, t: number): number[] {
  if (!(s >= 0 && s < h.nodes && t >= 0 && t < h.nodes)) return [];
  if (s === t) return [s];
  const buffer = new Int32Array(pathCapacity(h));
  return Array.from(buffer.subarray(0, writePath(h, s, t, buffer)));
}

/**
 * The control polygon of a path at a bundling strength `beta` (0 to 1): the path's points, each
 * moved toward the point at the same share of the straight line between the two ends. Flat
 * `[x0, y0, …]`; the ends are the path's ends bit for bit.
 */
export function controlPolygon(
  h: BundleHierarchy,
  path: ArrayLike<number>,
  beta: number,
  count: number = path.length,
  into: Float64Array = new Float64Array(2 * count),
): Float64Array {
  if (count < 1) return into;
  const last = count - 1;
  const ax = h.x[path[0]!]!;
  const ay = h.y[path[0]!]!;
  const bx = h.x[path[last]!]!;
  const by = h.y[path[last]!]!;
  const dx = bx - ax;
  const dy = by - ay;
  for (let i = 1; i < last; i++) {
    const a = path[i]!;
    const f = i / last;
    into[2 * i] = beta * h.x[a]! + (1 - beta) * (ax + f * dx);
    into[2 * i + 1] = beta * h.y[a]! + (1 - beta) * (ay + f * dy);
  }
  into[0] = ax;
  into[1] = ay;
  into[2 * last] = bx;
  into[2 * last + 1] = by;
  return into;
}

/**
 * Hierarchical edge bundling: one entry per link (the indices of `graph.source`), a `'spline'`
 * route for every link that is bundled and `undefined` for a link that stays straight. See the
 * module comment for the hierarchy, the curve and which links stay straight. Without a hierarchy
 * (no groups and no parents) every entry is `undefined`.
 */
export function hierarchicalBundle(
  positions: BundlePositions,
  graph: BundleGraph,
  options: HierarchicalBundleOptions = {},
): (LinkRoute | undefined)[] {
  const links = Math.min(graph.source.length, graph.target.length);
  const routes = new Array<LinkRoute | undefined>(links).fill(undefined);
  const strength = unit(options.strength, DEFAULT_BUNDLE_STRENGTH);
  if (links === 0 || strength === 0) return routes;
  const h = buildHierarchy(positions, graph, options);
  if (!h) return routes;
  const same = strength * unit(options.sameGroupStrength, 0.5);
  const n = h.nodes;
  const path = new Int32Array(pathCapacity(h));
  const polygon = new Float64Array(2 * path.length);
  for (let k = 0; k < links; k++) {
    const s = graph.source[k]!;
    const t = graph.target[k]!;
    if (!(s >= 0 && s < n && t >= 0 && t < n) || s === t) continue;
    if (!Number.isFinite(h.x[s]! + h.y[s]! + h.x[t]! + h.y[t]!)) continue;
    const count = writePath(h, s, t, path);
    if (count < 3) continue;
    const beta = count === 3 ? same : strength;
    if (beta === 0) continue;
    controlPolygon(h, path, beta, count, polygon);
    routes[k] = { points: bsplineToBezier(polygon, count), kind: 'spline' };
  }
  return routes;
}
