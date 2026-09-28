/**
 * Levels of a hierarchy (plan E13.1): the current root a chart starts from (`level`, Plotly's
 * "entry"), how deep it goes (`maxdepth`), where a click drills to, and d3's `partition` layout of
 * the entry's subtree, which sunburst and icicle size their sectors and rectangles with. Ported
 * from plotly.js' `traces/sunburst/helpers.js`, `fx.js` and `plot.js`.
 */
import type { Hierarchy, HierNode } from './build.ts';

/** Plotly's `getMaxDepth`: `maxdepth` when ≥ 0, else no limit. */
export function maxDepthOf(maxdepth: unknown): number {
  return typeof maxdepth === 'number' && maxdepth >= 0 ? maxdepth : Infinity;
}

/** Nodes of the subtree at `root` in d3's `eachAfter` order (children before their parent). */
function postOrder(root: HierNode): HierNode[] {
  const out: HierNode[] = [];
  const visit = (n: HierNode): void => {
    for (const c of n.children) visit(c);
    out.push(n);
  };
  visit(root);
  return out;
}

/**
 * The entry for `level` (Plotly's `findEntryWithLevel`): the node whose id is `level` — the last
 * one bottom-up when ids repeat — else the root (unset, `''` or unknown levels).
 */
export function findEntry(hierarchy: Hierarchy, level: unknown): HierNode {
  if (!level) return hierarchy.root;
  return lastBottomUp(hierarchy, (n) => n.id === level);
}

/** The node with a child `childId` (Plotly's `findEntryWithChild`), else the root. */
export function findParentEntry(hierarchy: Hierarchy, childId: string): HierNode {
  return lastBottomUp(hierarchy, (n) => n.children.some((c) => c.id === childId));
}

/** The last node matching `test` in d3's `eachAfter` order, else the root. */
function lastBottomUp(hierarchy: Hierarchy, test: (n: HierNode) => boolean): HierNode {
  const matches = hierarchy.nodes.filter(test);
  if (matches.length <= 1) return matches[0] ?? hierarchy.root;
  // Repeated ids (leaves may repeat): the order d3 visits them in decides.
  const set = new Set(matches);
  let out: HierNode | undefined;
  for (const n of postOrder(hierarchy.root)) if (set.has(n)) out = n;
  return out ?? hierarchy.root;
}

/** Plotly's `isHierarchyRoot`: the node has no parent id. */
export function isHierarchyRoot(n: HierNode): boolean {
  return n.pid === '';
}

/** Plotly's `isLeaf`. */
export function isLeaf(n: HierNode): boolean {
  return n.children.length === 0;
}

/** Plotly's `getParent`: the parent node, the root for the root itself. */
export function parentOf(n: HierNode): HierNode {
  return n.parent ?? n;
}

/**
 * The entry a click on `node` leads to (Plotly's `onClick` in `fx.js`): the entry's parent level
 * when the entry itself (the center) is clicked, else the node's own level. `undefined` when the
 * click does not drill: on the hierarchy root, and on leaves unless `leaves` (sunburst stops
 * there; treemap and icicle zoom into leaves too).
 */
export function drillEntry(
  hierarchy: Hierarchy,
  node: HierNode,
  entry: HierNode,
  options: { readonly leaves?: boolean } = {},
): HierNode | undefined {
  if (isHierarchyRoot(node) || (!options.leaves && isLeaf(node))) return undefined;
  return node === entry ? findParentEntry(hierarchy, node.id) : findEntry(hierarchy, node.id);
}

/** Depth of `node` below `entry` (the entry is 0). */
export function relativeDepth(node: HierNode, entry: HierNode): number {
  return node.depth - entry.depth;
}

/**
 * Which levels of the entry's subtree a chart draws (Plotly's `maxdepth` handling in the plot
 * functions): the generated root of several roots is skipped when it is the entry, and at most
 * `maxdepth` levels are drawn.
 */
export interface LevelWindow {
  /** The entry is the generated root of several roots: not drawn. */
  readonly skipEntry: boolean;
  /** Depth (below the entry) of the first level drawn: 1 when `skipEntry`, else 0. */
  readonly offset: number;
  /** Levels drawn, the outermost ring or row included: `min(levels in the subtree, maxdepth)`. */
  readonly levels: number;
  /** Nodes whose depth below the entry is less than this are drawn. */
  readonly cutoff: number;
}

/** The {@link LevelWindow} of `entry` with `maxdepth` (Plotly's `maxHeight`, `yOffset`, `cutoff`). */
export function levelWindow(hierarchy: Hierarchy, entry: HierNode, maxdepth: unknown): LevelWindow {
  const maxDepth = maxDepthOf(maxdepth);
  const skipEntry = hierarchy.hasMultipleRoots && entry === hierarchy.root;
  const height = entry.height + 1 - (skipEntry ? 1 : 0);
  return {
    skipEntry,
    offset: skipEntry ? 1 : 0,
    levels: Math.min(height, maxDepth),
    cutoff: maxDepth + (skipEntry ? 1 : 0),
  };
}

/** A node placed by {@link partition}: `x` along the partitioned axis, `y` across levels. */
export interface PartitionCell {
  readonly node: HierNode;
  /** Depth below the entry. */
  readonly depth: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * d3's `partition` of the subtree at `entry` over `[0, dx] × [0, dy]`: each level is
 * `dy / (entry.height + 1)` tall, and children split their parent's `x` span by value (d3's
 * `treemapDice`; a remainder or `total` above the children's sum leaves a gap at the end). Cells
 * come breadth first (d3 `descendants`), so parents precede their children. With `padding` (icicle's
 * `tiling.pad`), every cell then gives up `padding` px at its far `x` and `y` ends, and the entry
 * starts `padding` px in, as in d3.
 */
export function partition(entry: HierNode, dx: number, dy: number, padding = 0): PartitionCell[] {
  const n = entry.height + 1;
  const cells: PartitionCell[] = [
    { node: entry, depth: 0, x0: padding, x1: dx, y0: padding, y1: dy / n },
  ];
  for (let k = 0; k < cells.length; k++) {
    const cell = cells[k]!;
    const { node } = cell;
    if (node.children.length === 0) continue;
    const y0 = (dy * (cell.depth + 1)) / n;
    const y1 = (dy * (cell.depth + 2)) / n;
    const scale = node.value ? (cell.x1 - cell.x0) / node.value : 0;
    let x = cell.x0;
    for (const child of node.children) {
      const x0 = x;
      x += child.value * scale;
      cells.push({ node: child, depth: cell.depth + 1, x0, x1: x, y0, y1 });
    }
  }
  if (padding > 0) {
    // d3 pads each node after its children were placed in its unpadded span.
    for (const c of cells) {
      c.x1 -= padding;
      c.y1 -= padding;
      if (c.x1 < c.x0) c.x0 = c.x1 = (c.x0 + c.x1) / 2;
      if (c.y1 < c.y0) c.y0 = c.y1 = (c.y0 + c.y1) / 2;
    }
  }
  return cells;
}
