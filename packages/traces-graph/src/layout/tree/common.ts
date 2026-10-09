/**
 * What the three tree layouts share (backlog G4): the options they all take, the result they all
 * return, and the small steps around the layout proper (reading sizes, turning the drawing to its
 * orientation, parking hidden nodes, handing routes to links).
 *
 * A tree is laid out in its own frame and turned at the end. **Breadth** runs across the tree in
 * sibling order, **level** runs from the root towards the leaves:
 *
 * | orientation | root   | siblings run  | x          | y          |
 * | ----------- | ------ | ------------- | ---------- | ---------- |
 * | `'TB'`      | top    | left to right | breadth    | −level     |
 * | `'BT'`      | bottom | left to right | breadth    | level      |
 * | `'LR'`      | left   | top to bottom | level      | −breadth   |
 * | `'RL'`      | right  | top to bottom | −level     | −breadth   |
 *
 * So siblings always read in the order of the page (left to right, top to bottom); `'BT'` is `'TB'`
 * flipped upside down, `'LR'` is `'TB'` flipped over the falling diagonal (x and y swap roles, as
 * do node widths and heights) and `'RL'` is `'LR'` flipped left to right.
 */
import type { LayoutGraph, LayoutResult, LinkRoute } from '../types.ts';
import type { CollapsedInput, Forest, TreeSort, TreeView } from './forest.ts';

/** Where the root is: top (`'TB'`), bottom (`'BT'`), left (`'LR'`) or right (`'RL'`). */
export type TreeOrientation = 'TB' | 'BT' | 'LR' | 'RL';

/** Options every tree layout takes. */
export interface TreeOptions {
  /**
   * Collapsed nodes: node indices (any iterable), or a `Uint8Array` with one byte per node, non-zero
   * for a collapsed one. The descendants of a collapsed node are left out of the layout
   * ({@link TreeLayoutResult.hidden}), take no room, and are given the position of their nearest
   * visible ancestor. Default none.
   */
  readonly collapsed?: CollapsedInput;
  /**
   * Order of siblings: `'input'` (node order for a tree input, link order otherwise), `'size'` (by
   * the number of nodes in the subtree, hidden ones included) or `'value'` (by `graph.value`, nodes
   * without one last). Default `'input'`.
   */
  readonly sort?: TreeSort;
  /** Which way `'size'` and `'value'` sort. Default `'descending'` (largest first). */
  readonly sortOrder?: 'descending' | 'ascending';
}

/** What a tree layout returns on top of positions. */
export interface TreeLayoutResult extends LayoutResult {
  /** 1 where the node is below a collapsed node; it sits on its nearest visible ancestor. */
  readonly hidden: Uint8Array;
  /** The forest that was drawn: each node's parent, `-1` for a root. */
  readonly parent: Int32Array;
  /** Links from the root, 0 for a root. */
  readonly depth: Int32Array;
  /** The link that joins each node to its parent, `-1` where there is none. */
  readonly parentLink: Int32Array;
  /**
   * By link index: 1 where the link is a tree edge. The others (links that close a cycle, skip a
   * level or repeat a tree edge) are not part of the layout and never have a route.
   */
  readonly treeLinks: Uint8Array;
  /**
   * The same routes by **child node**: the path from a node's parent to it (`undefined`: straight,
   * hidden or a root). For a figure that gives a tree as `ids` / `parents` and has no links to
   * hang {@link LayoutResult.routes} on. Absent when all links are straight.
   */
  readonly parentRoutes?: readonly (LinkRoute | undefined)[];
}

/** A length option: the given value when it is a finite number ≥ 0, else the default. */
export function lengthOption(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Half extents as a layout can use them: finite and ≥ 0, 0 for anything else. */
export function halfExtents(sizes: Float64Array, n: number): Float64Array {
  const out = new Float64Array(n);
  for (let i = Math.min(n, sizes.length) - 1; i >= 0; i--) {
    const v = sizes[i]!;
    if (v > 0 && v < Infinity) out[i] = v;
  }
  return out;
}

/** The turn from the tree's frame (breadth, level) to x and y: see the file header. */
export interface TreeFrame {
  /** Levels run along x (`'LR'`, `'RL'`): breadth is measured by node heights, levels by widths. */
  readonly horizontal: boolean;
  /** `x = xb · breadth + xl · level`, `y = yb · breadth + yl · level`. */
  readonly xb: number;
  readonly xl: number;
  readonly yb: number;
  readonly yl: number;
}

const FRAMES: Readonly<Record<TreeOrientation, TreeFrame>> = {
  TB: { horizontal: false, xb: 1, xl: 0, yb: 0, yl: -1 },
  BT: { horizontal: false, xb: 1, xl: 0, yb: 0, yl: 1 },
  LR: { horizontal: true, xb: 0, xl: 1, yb: -1, yl: 0 },
  RL: { horizontal: true, xb: 0, xl: -1, yb: -1, yl: 0 },
};

/** The frame of an orientation; anything that is not one reads as `'TB'`. */
export function treeFrame(orientation: TreeOrientation | undefined): TreeFrame {
  return (orientation !== undefined ? FRAMES[orientation] : undefined) ?? FRAMES.TB;
}

/**
 * A route through points given in the tree's frame as `[breadth0, level0, breadth1, level1, …]`.
 * A polyline drops points that repeat the one before (a zero-length segment has no direction to
 * join with), and one that is left with two points is a straight link: `undefined`.
 */
export function frameRoute(
  frame: TreeFrame,
  kind: LinkRoute['kind'],
  ...frameCoordinates: number[]
): LinkRoute | undefined {
  const points = new Float64Array(frameCoordinates.length);
  let count = 0;
  for (let i = 0; i < frameCoordinates.length; i += 2) {
    const b = frameCoordinates[i]!;
    const l = frameCoordinates[i + 1]!;
    if (
      kind === 'polyline' &&
      i > 0 &&
      b === frameCoordinates[i - 2] &&
      l === frameCoordinates[i - 1]
    ) {
      continue;
    }
    points[count++] = frame.xb * b + frame.xl * l + 0;
    points[count++] = frame.yb * b + frame.yl * l + 0;
  }
  if (count === points.length) return { points, kind };
  return count > 4 ? { points: points.slice(0, count), kind } : undefined;
}

/** Puts every hidden node on its nearest visible ancestor. */
export function parkHidden(view: TreeView, x: Float64Array, y: Float64Array): void {
  const { forest, hidden } = view;
  for (let s = 0; s < forest.nodes; s++) {
    const v = forest.order[s]!;
    if (!hidden[v]) continue;
    const p = forest.parent[v]!;
    x[v] = x[p]!;
    y[v] = y[p]!;
  }
}

/** The same route walked from its other end. */
function reversed(route: LinkRoute): LinkRoute {
  const { points } = route;
  const out = new Float64Array(points.length);
  for (let i = 0; i < points.length; i += 2) {
    out[points.length - 2 - i] = points[i]!;
    out[points.length - 1 - i] = points[i + 1]!;
  }
  return { points: out, kind: route.kind };
}

/**
 * Routes by link from routes by child node. A route runs from the link's source to its target, so
 * a tree edge that points from child to parent gets its route turned around.
 */
export function linkRoutes(
  graph: LayoutGraph,
  forest: Forest,
  parentRoutes: readonly (LinkRoute | undefined)[],
): (LinkRoute | undefined)[] {
  const routes = new Array<LinkRoute | undefined>(graph.source.length).fill(undefined);
  for (let v = 0; v < forest.nodes; v++) {
    const route = parentRoutes[v];
    const k = forest.parentLink[v]!;
    if (!route || k < 0) continue;
    routes[k] = graph.source[k] === forest.parent[v] ? route : reversed(route);
  }
  return routes;
}

/** The fields of a result that come straight from the forest and the view. */
export function treeFields(
  view: TreeView,
): Pick<TreeLayoutResult, 'hidden' | 'parent' | 'depth' | 'parentLink' | 'treeLinks'> {
  const { parent, depth, parentLink, treeLinks } = view.forest;
  return { hidden: view.hidden, parent, depth, parentLink, treeLinks };
}
