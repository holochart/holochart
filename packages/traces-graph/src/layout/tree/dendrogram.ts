/**
 * Dendrogram layout (backlog G4): a tree drawn to show **heights**, as hierarchical clustering
 * draws its merges. All leaves stand on one line, evenly spaced in tree order; each inner node is
 * above the middle of its children at the height the data gives it. This is the layout a future
 * `ff.dendrogram` targets (plan E11.9), so it follows scipy's `dendrogram` drawing: with two
 * children per node the positions are scipy's `icoord` and `dcoord` up to scale.
 *
 * ## Steps
 *
 * 1. **Leaves** (visible nodes without visible children, so a collapsed node is one) take slots
 *    along the leaf axis in tree order. The pitch is the widest visible node plus `nodesep`, so
 *    nodes of one height never overlap either.
 * 2. **Inner nodes** go to the mean of their children's positions, bottom up (the midpoint, for
 *    two children).
 * 3. **Heights.** With `graph.value` given for at least one visible inner node, a node's height is
 *    its value: the merge distance of a clustering. A leaf without a value is at 0 and an inner
 *    node without one at the height of its highest child. Values are not required to grow towards
 *    the root (centroid linkage can invert). Without values, a node's height is the number of
 *    levels to its deepest leaf, so all leaves still line up.
 * 4. Heights become lengths through `valueScale`; by default the highest node is `ranksep` per
 *    level above the lowest. The drawing is turned to `orientation` (see `common.ts`: `'TB'` has
 *    the root at the top and the leaves on a line at the bottom) and its bounding box, node extents
 *    included, is centred on the origin. {@link DendrogramResult.valueAxis} says where a value is
 *    on the page, for an axis with ticks in the data's units.
 *
 * A collapsed node keeps the height its value gives it, so folding a cluster does not move the
 * merges above it. Without values, heights are counted from the visible leaves and do move.
 *
 * ## Link routes
 *
 * Routes join node centers: a node here is a point on a scale, and its size only spaces the
 * leaves. `'elbow'` (the default) leaves the parent along the leaf axis and turns down to the
 * child, so the links of one parent draw the bracket of a clustering dendrogram. A child straight
 * below its parent, or at its parent's height, is a straight link and has no route. `'straight'`
 * returns no routes.
 */
import type { LayoutGraph, LinkRoute } from '../types.ts';
import {
  frameRoute,
  halfExtents,
  lengthOption,
  linkRoutes,
  parkHidden,
  treeFields,
  treeFrame,
  type TreeLayoutResult,
  type TreeOptions,
  type TreeOrientation,
} from './common.ts';
import { buildForest, viewForest } from './forest.ts';

/** Options of {@link dendrogramLayout}. Lengths are layout units (CSS px). */
export interface DendrogramOptions extends TreeOptions {
  /** Where the root is; the leaves line up on the opposite side. Default `'TB'`. */
  readonly orientation?: TreeOrientation;
  /** Room between two leaves, on top of the widest node. Default 20. */
  readonly nodesep?: number;
  /**
   * Length of one level. Without values every level is this high; with values it sets the default
   * scale (the full height is `ranksep` times the number of levels). Default 50.
   */
  readonly ranksep?: number;
  /** Layout units per unit of `graph.value`. Default: from `ranksep`, see above. */
  readonly valueScale?: number;
  /** Shape of the tree edges: see the file header. Default `'elbow'`. */
  readonly links?: 'elbow' | 'straight';
}

/** What {@link dendrogramLayout} returns. */
export interface DendrogramResult extends TreeLayoutResult {
  /** What the heights are: `graph.value`, or levels above the deepest leaf. */
  readonly heights: 'value' | 'level';
  /**
   * The scale the heights are drawn on: a height `h` (a value, or a number of levels) is at
   * `offset + scale · h` along `axis`. `scale` is negative where heights grow against the axis.
   */
  readonly valueAxis: {
    readonly axis: 'x' | 'y';
    readonly offset: number;
    readonly scale: number;
  };
}

/** Lays a tree or forest out as a dendrogram. Linear in nodes + links (sorting aside). */
export function dendrogramLayout(
  graph: LayoutGraph,
  options: DendrogramOptions = {},
): DendrogramResult {
  const forest = buildForest(graph);
  const view = viewForest(forest, graph, options);
  const n = forest.nodes;
  const { parent } = forest;
  const { order, childStart, childEnd } = view;
  const frame = treeFrame(options.orientation);
  const nodesep = lengthOption(options.nodesep, 20);
  const ranksep = lengthOption(options.ranksep, 50);
  const across = halfExtents(frame.horizontal ? graph.halfHeight : graph.halfWidth, n);
  const along = halfExtents(frame.horizontal ? graph.halfWidth : graph.halfHeight, n);
  const isLeaf = (v: number): boolean => childEnd[v] === childStart[v];

  // Steps 1 and 2: leaves in slots, inner nodes at the mean of their children.
  let widest = 0;
  for (let s = 0; s < order.length; s++) widest = Math.max(widest, across[order[s]!]!);
  const pitch = 2 * widest + nodesep;
  const breadth = new Float64Array(n);
  let leaves = 0;
  for (let s = 0; s < order.length; s++) {
    const v = order[s]!;
    if (isLeaf(v)) breadth[v] = leaves++ * pitch;
  }
  // Step 3 on the same way up: levels above the deepest leaf, and the highest child.
  const values = graph.value;
  let byValue = false;
  if (values) {
    for (let s = 0; s < order.length && !byValue; s++) {
      const v = order[s]!;
      byValue = !isLeaf(v) && Number.isFinite(values[v]);
    }
  }
  const level = new Int32Array(n);
  const height = new Float64Array(n);
  const below = new Float64Array(n).fill(-Infinity);
  for (let s = order.length - 1; s >= 0; s--) {
    const v = order[s]!;
    if (!isLeaf(v)) breadth[v] = breadth[v]! / (childEnd[v]! - childStart[v]!);
    if (!byValue) height[v] = level[v]!;
    else if (Number.isFinite(values![v])) height[v] = values![v]!;
    else height[v] = isLeaf(v) ? 0 : below[v]!;
    const p = parent[v]!;
    if (p < 0) continue;
    breadth[p]! += breadth[v]!;
    level[p] = Math.max(level[p]!, level[v]! + 1);
    below[p] = Math.max(below[p]!, height[v]!);
  }

  // Step 4: heights to lengths, the frame, the page.
  let low = Infinity;
  let high = -Infinity;
  let levels = 0;
  for (let s = 0; s < order.length; s++) {
    const v = order[s]!;
    low = Math.min(low, height[v]!);
    high = Math.max(high, height[v]!);
    levels = Math.max(levels, level[v]!);
  }
  let scale = ranksep;
  if (byValue) {
    const given = options.valueScale;
    if (typeof given === 'number' && Number.isFinite(given) && given > 0) scale = given;
    else scale = high > low ? (levels * ranksep) / (high - low) : 0;
  }

  // In the frame, level 0 is the highest node and levels grow towards the leaves.
  let b0 = Infinity;
  let b1 = -Infinity;
  let l0 = Infinity;
  let l1 = -Infinity;
  const levelOf = new Float64Array(n);
  for (let s = 0; s < order.length; s++) {
    const v = order[s]!;
    const l = (levelOf[v] = (high - height[v]!) * scale);
    b0 = Math.min(b0, breadth[v]! - across[v]!);
    b1 = Math.max(b1, breadth[v]! + across[v]!);
    l0 = Math.min(l0, l - along[v]!);
    l1 = Math.max(l1, l + along[v]!);
  }
  const midBreadth = order.length > 0 ? (b0 + b1) / 2 : 0;
  const midLevel = order.length > 0 ? (l0 + l1) / 2 : 0;

  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let s = 0; s < order.length; s++) {
    const v = order[s]!;
    const b = (breadth[v]! -= midBreadth);
    const l = (levelOf[v]! -= midLevel);
    // `+ 0`: no negative zeros in the output.
    x[v] = frame.xb * b + frame.xl * l + 0;
    y[v] = frame.yb * b + frame.yl * l + 0;
  }
  parkHidden(view, x, y);

  // A height h is at level (high − h) · scale − midLevel in the frame.
  const levelSign = frame.horizontal ? frame.xl : frame.yl;
  const top = order.length > 0 ? high * scale - midLevel : 0;
  const fields = {
    x,
    y,
    ...treeFields(view),
    heights: byValue ? ('value' as const) : ('level' as const),
    valueAxis: {
      axis: frame.horizontal ? ('x' as const) : ('y' as const),
      offset: levelSign * top + 0,
      scale: -levelSign * scale + 0,
    },
  };
  if (options.links === 'straight') return fields;

  const parentRoutes = new Array<LinkRoute | undefined>(n).fill(undefined);
  for (let s = 0; s < order.length; s++) {
    const v = order[s]!;
    const p = parent[v]!;
    if (p < 0) continue;
    const bp = breadth[p]!;
    const lp = levelOf[p]!;
    parentRoutes[v] = frameRoute(
      frame,
      'polyline',
      bp,
      lp,
      breadth[v]!,
      lp,
      breadth[v]!,
      levelOf[v]!,
    );
  }
  return { ...fields, routes: linkRoutes(graph, forest, parentRoutes), parentRoutes };
}
