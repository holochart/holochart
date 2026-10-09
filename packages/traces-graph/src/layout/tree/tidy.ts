/**
 * Tidy tree layout (backlog G4): the classic node-link drawing of a tree, levels in rows, each
 * parent centred over its children, subtrees packed as closely as their outlines allow.
 *
 * Positions across the tree come from `buchheim.ts` (Reingold–Tilford in Buchheim, Jünger and
 * Leipert's linear form). What this file adds is node sizes and the page:
 *
 * - **Across**, two neighbours on a level are kept apart by their real half extents plus `nodesep`
 *   (siblings) or `subtreesep` (the facing ends of two subtrees, and the trees of a forest).
 * - **Along**, every level is as thick as its tallest node, and levels are `ranksep` apart, so no
 *   node of one level reaches into the next.
 * - A forest (several roots) is laid out as the children of a root that is not drawn: its trees
 *   stand side by side, roots on one level.
 * - The drawing is turned to `orientation` (see `common.ts`) and its bounding box, node extents
 *   included, is centred on the origin.
 *
 * ## Link routes
 *
 * `links: 'straight'` returns none (the trace joins centers). The other two start in the middle of
 * the parent's side that faces its children and end in the middle of the child's side that faces
 * its parent, so an arrowhead lands on the node's edge:
 * - `'curved'`: one cubic Bézier that leaves and arrives along the level axis (the S-curve of a
 *   d3 `linkVertical`), control points halfway between the two ends;
 * - `'elbow'`: an orthogonal polyline with its cross bar halfway through the gap between the two
 *   levels, so the bars of all the links of a level line up. A child straight below its parent
 *   needs no route.
 */
import type { LayoutGraph, LinkRoute } from '../types.ts';
import { tidyBreadth } from './buchheim.ts';
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

/** How the tree edges of a tidy or radial tree are drawn. */
export type TreeLinkShape = 'straight' | 'curved' | 'elbow';

/** Options of {@link tidyTreeLayout}. Lengths are layout units (CSS px). */
export interface TidyTreeOptions extends TreeOptions {
  /** Where the root is. Default `'TB'` (root at the top). */
  readonly orientation?: TreeOrientation;
  /** Room between two siblings, on top of their sizes. Default 20. */
  readonly nodesep?: number;
  /**
   * Room between two neighbours that are not siblings (the ends of two subtrees, two trees of a
   * forest), on top of their sizes. Default: `nodesep`.
   */
  readonly subtreesep?: number;
  /** Room between two levels, on top of their thickest nodes. Default 50. */
  readonly ranksep?: number;
  /** Shape of the tree edges: see the file header. Default `'straight'`. */
  readonly links?: TreeLinkShape;
}

/** Lays a tree or forest out as a tidy tree. Linear in nodes + links (sorting aside). */
export function tidyTreeLayout(
  graph: LayoutGraph,
  options: TidyTreeOptions = {},
): TreeLayoutResult {
  const forest = buildForest(graph);
  const view = viewForest(forest, graph, options);
  const n = forest.nodes;
  const { parent, depth } = forest;
  const { order } = view;
  const frame = treeFrame(options.orientation);
  const nodesep = lengthOption(options.nodesep, 20);
  const subtreesep = lengthOption(options.subtreesep, nodesep);
  const ranksep = lengthOption(options.ranksep, 50);
  // Half extents across the tree and along it.
  const across = halfExtents(frame.horizontal ? graph.halfHeight : graph.halfWidth, n);
  const along = halfExtents(frame.horizontal ? graph.halfWidth : graph.halfHeight, n);

  const breadth = tidyBreadth(
    view,
    (a, b) =>
      across[a]! + across[b]! + (parent[a]! >= 0 && parent[a] === parent[b] ? nodesep : subtreesep),
  );

  // Levels: each as thick as its thickest visible node (half of that here), `ranksep` apart.
  let levels = 0;
  for (let s = 0; s < order.length; s++) levels = Math.max(levels, depth[order[s]!]! + 1);
  const halfThick = new Float64Array(levels);
  for (let s = 0; s < order.length; s++) {
    const v = order[s]!;
    const d = depth[v]!;
    if (along[v]! > halfThick[d]!) halfThick[d] = along[v]!;
  }
  const levelAt = new Float64Array(levels);
  for (let d = 1; d < levels; d++) {
    levelAt[d] = levelAt[d - 1]! + halfThick[d - 1]! + ranksep + halfThick[d]!;
  }

  // Center the bounding box (with node extents) on the origin.
  let b0 = Infinity;
  let b1 = -Infinity;
  for (let s = 0; s < order.length; s++) {
    const v = order[s]!;
    b0 = Math.min(b0, breadth[v]! - across[v]!);
    b1 = Math.max(b1, breadth[v]! + across[v]!);
  }
  const midBreadth = order.length > 0 ? (b0 + b1) / 2 : 0;
  const midLevel =
    levels > 0 ? (levelAt[levels - 1]! + halfThick[levels - 1]! - halfThick[0]!) / 2 : 0;
  for (let d = 0; d < levels; d++) levelAt[d]! -= midLevel;

  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let s = 0; s < order.length; s++) {
    const v = order[s]!;
    const b = (breadth[v]! -= midBreadth);
    const l = levelAt[depth[v]!]!;
    // `+ 0`: no negative zeros in the output.
    x[v] = frame.xb * b + frame.xl * l + 0;
    y[v] = frame.yb * b + frame.yl * l + 0;
  }
  parkHidden(view, x, y);

  const shape = options.links;
  if (shape !== 'curved' && shape !== 'elbow') return { x, y, ...treeFields(view) };

  const parentRoutes = new Array<LinkRoute | undefined>(n).fill(undefined);
  for (let s = 0; s < order.length; s++) {
    const v = order[s]!;
    const p = parent[v]!;
    if (p < 0) continue;
    const d = depth[v]!;
    const bp = breadth[p]!;
    const bv = breadth[v]!;
    // The facing sides of the two nodes.
    const lp = levelAt[d - 1]! + along[p]!;
    const lv = levelAt[d]! - along[v]!;
    if (shape === 'curved') {
      const half = (lp + lv) / 2;
      parentRoutes[v] = frameRoute(frame, 'spline', bp, lp, bp, half, bv, half, bv, lv);
    } else if (bp !== bv) {
      const bar = (levelAt[d - 1]! + halfThick[d - 1]! + levelAt[d]! - halfThick[d]!) / 2;
      parentRoutes[v] = frameRoute(frame, 'polyline', bp, lp, bp, bar, bv, bar, bv, lv);
    }
  }
  return {
    x,
    y,
    routes: linkRoutes(graph, forest, parentRoutes),
    parentRoutes,
    ...treeFields(view),
  };
}
