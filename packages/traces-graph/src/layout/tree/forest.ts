/**
 * The forest a tree layout draws (backlog G4): one parent per node, from the figure's tree input or
 * from the links, and the view of it a layout works on (collapsed subtrees left out, siblings in
 * drawing order). Shared by the tidy tree, the radial tree and the dendrogram, so the three agree on
 * which links are tree edges and a figure can swap one for another.
 *
 * ## Parents
 *
 * - **Tree input** (`graph.parent`, what `ids` / `parents` give): taken as it is. A parent that is
 *   out of range, or the node itself, makes the node a root. A cycle of parents has no root, so its
 *   lowest node becomes one. Siblings keep node order.
 * - **Links** (no `graph.parent`): a breadth-first spanning forest.
 *   1. The roots are the nodes without incoming links (self-links do not count), all in the queue
 *      at the start, in node order: a node reachable from several roots joins the nearest one, the
 *      earlier one on a tie.
 *   2. The search follows links from source to target; then, for what that did not reach (a node
 *      that only points at the tree), it goes on over the links in both directions.
 *   3. A component without any root (every node has an incoming link: a cycle) takes its lowest
 *      node as the root and is searched the same way.
 *
 *   So every node is in exactly one tree. Links that close a cycle, jump levels or repeat another
 *   are not tree edges: {@link Forest.treeLinks} says which ones are, and the trace draws the rest
 *   as plain links over the tree. Siblings are in the order the search found them, which is the
 *   order of the parent's links.
 *
 * Everything is iterative and linear in nodes + links: a path of 100,000 nodes is a tree too.
 */
import type { LayoutGraph } from '../types.ts';

/** A rooted forest over the nodes of a {@link LayoutGraph}. */
export interface Forest {
  readonly nodes: number;
  /** Parent of each node, `-1` for a root. */
  readonly parent: Int32Array;
  /** The roots, in node order. */
  readonly roots: Int32Array;
  /** Children of node `i`: `children[childStart[i] … childStart[i + 1])`, in input order. */
  readonly childStart: Int32Array;
  readonly children: Int32Array;
  /** Links from the root: 0 for a root. */
  readonly depth: Int32Array;
  /** Every node, parents before children, subtrees in sibling order (preorder). */
  readonly order: Int32Array;
  /** Nodes in each node's subtree, itself included. */
  readonly size: Int32Array;
  /**
   * The link that joins each node to its parent, `-1` for a root and for a node of a tree input
   * that has no link to its parent. The link may point either way.
   */
  readonly parentLink: Int32Array;
  /** By link index: 1 where the link is a tree edge (some node's {@link parentLink}). */
  readonly treeLinks: Uint8Array;
}

/** Which subtrees are folded: node indices, or a mask with one byte per node (`Uint8Array`). */
export type CollapsedInput = Iterable<number> | Uint8Array;

/** How siblings are ordered. */
export type TreeSort = 'input' | 'size' | 'value';

export interface TreeViewOptions {
  readonly collapsed?: CollapsedInput | undefined;
  readonly sort?: TreeSort | undefined;
  readonly sortOrder?: 'descending' | 'ascending' | undefined;
}

/**
 * A forest as a layout draws it: without the descendants of collapsed nodes, siblings sorted.
 * Hidden nodes have no entry in {@link order}, and a collapsed node has no children here.
 */
export interface TreeView {
  readonly forest: Forest;
  /** 1 where the node is below a collapsed node. */
  readonly hidden: Uint8Array;
  /** Visible roots, in drawing order. */
  readonly roots: Int32Array;
  /** Visible children of node `i`, in drawing order: `children[childStart[i] … childEnd[i])`. */
  readonly childStart: Int32Array;
  readonly childEnd: Int32Array;
  readonly children: Int32Array;
  /** Visible nodes in preorder: on any one level this is the drawing order. */
  readonly order: Int32Array;
}

/** Builds the forest of a graph: see the file header for the rules. */
export function buildForest(graph: LayoutGraph): Forest {
  const n = Math.max(0, Math.trunc(graph.nodes)) || 0;
  const parent = new Int32Array(n).fill(-1);
  const parentLink = new Int32Array(n).fill(-1);
  // The order in which nodes take their place among their siblings.
  const sequence = new Int32Array(n);
  if (graph.parent) parentsFromInput(graph, n, parent, parentLink, sequence);
  else parentsFromLinks(graph, n, parent, parentLink, sequence);

  const treeLinks = new Uint8Array(graph.source.length);
  for (let i = 0; i < n; i++) {
    const k = parentLink[i]!;
    if (k >= 0) treeLinks[k] = 1;
  }

  // Children in compressed rows, filled in `sequence` order so siblings keep their input order.
  const childStart = new Int32Array(n + 1);
  let rootCount = 0;
  for (let i = 0; i < n; i++) {
    const p = parent[i]!;
    if (p < 0) rootCount++;
    else childStart[p + 1]!++;
  }
  for (let i = 0; i < n; i++) childStart[i + 1]! += childStart[i]!;
  const children = new Int32Array(n - rootCount);
  const fill = childStart.slice(0, n);
  for (let s = 0; s < n; s++) {
    const i = sequence[s]!;
    const p = parent[i]!;
    if (p >= 0) children[fill[p]!++] = i;
  }
  const roots = new Int32Array(rootCount);
  for (let i = 0, r = 0; i < n; i++) if (parent[i]! < 0) roots[r++] = i;

  // Preorder with an explicit stack, depths on the way down, subtree sizes on the way back.
  const order = new Int32Array(n);
  const depth = new Int32Array(n);
  const stack = new Int32Array(n);
  let count = 0;
  let top = 0;
  for (let r = rootCount - 1; r >= 0; r--) stack[top++] = roots[r]!;
  while (top > 0) {
    const v = stack[--top]!;
    order[count++] = v;
    for (let c = childStart[v + 1]! - 1; c >= childStart[v]!; c--) {
      const w = children[c]!;
      depth[w] = depth[v]! + 1;
      stack[top++] = w;
    }
  }
  const size = new Int32Array(n).fill(1);
  for (let s = n - 1; s >= 0; s--) {
    const v = order[s]!;
    const p = parent[v]!;
    if (p >= 0) size[p]! += size[v]!;
  }

  return {
    nodes: n,
    parent,
    roots,
    childStart,
    children,
    depth,
    order,
    size,
    parentLink,
    treeLinks,
  };
}

/** Parents from `graph.parent`: invalid entries become roots, cycles are cut at their lowest node. */
function parentsFromInput(
  graph: LayoutGraph,
  n: number,
  parent: Int32Array,
  parentLink: Int32Array,
  sequence: Int32Array,
): void {
  const input = graph.parent!;
  for (let i = 0; i < n; i++) {
    sequence[i] = i;
    const p = i < input.length ? input[i]! : -1;
    parent[i] = p >= 0 && p < n && p !== i ? p : -1;
  }

  // 0: not seen, 1: on the path being walked, 2: known to reach a root.
  const state = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let v = i;
    while (v >= 0 && state[v] === 0) {
      state[v] = 1;
      v = parent[v]!;
    }
    if (v >= 0 && state[v] === 1) {
      // The walk came back to its own path: `v` is on a cycle. Cut it above its lowest node.
      let lowest = v;
      state[v] = 2;
      for (let u = parent[v]!; u !== v; u = parent[u]!) {
        state[u] = 2;
        if (u < lowest) lowest = u;
      }
      parent[lowest] = -1;
    }
    for (let u = i; u >= 0 && state[u] === 1; u = parent[u]!) state[u] = 2;
  }

  // The link that draws each parent-child pair: one from parent to child if there is one, else one
  // from child to parent. The first such link wins.
  const { source, target } = graph;
  const links = Math.min(source.length, target.length);
  for (let k = 0; k < links; k++) {
    const s = source[k]!;
    const t = target[k]!;
    if (s >= 0 && t >= 0 && t < n && parent[t] === s && parentLink[t]! < 0) parentLink[t] = k;
  }
  for (let k = 0; k < links; k++) {
    const s = source[k]!;
    const t = target[k]!;
    if (t >= 0 && s >= 0 && s < n && parent[s] === t && parentLink[s]! < 0) parentLink[s] = k;
  }
}

/** Parents from the links: the breadth-first spanning forest of the file header. */
function parentsFromLinks(
  graph: LayoutGraph,
  n: number,
  parent: Int32Array,
  parentLink: Int32Array,
  queue: Int32Array,
): void {
  const { source, target } = graph;
  const links = Math.min(source.length, target.length);
  const usable = (k: number): boolean => {
    const s = source[k]!;
    const t = target[k]!;
    return s !== t && s >= 0 && s < n && t >= 0 && t < n;
  };

  // Outgoing and incoming links of each node in compressed rows, in link order.
  const outStart = new Int32Array(n + 1);
  const inStart = new Int32Array(n + 1);
  for (let k = 0; k < links; k++) {
    if (!usable(k)) continue;
    outStart[source[k]! + 1]!++;
    inStart[target[k]! + 1]!++;
  }
  for (let i = 0; i < n; i++) {
    outStart[i + 1]! += outStart[i]!;
    inStart[i + 1]! += inStart[i]!;
  }
  const outLinks = new Int32Array(outStart[n] ?? 0);
  const inLinks = new Int32Array(inStart[n] ?? 0);
  const outFill = outStart.slice(0, n);
  const inFill = inStart.slice(0, n);
  for (let k = 0; k < links; k++) {
    if (!usable(k)) continue;
    outLinks[outFill[source[k]!]!++] = k;
    inLinks[inFill[target[k]!]!++] = k;
  }

  const seen = new Uint8Array(n);
  let tail = 0;
  const reach = (v: number, from: number, link: number): void => {
    if (seen[v]) return;
    seen[v] = 1;
    parent[v] = from;
    parentLink[v] = link;
    queue[tail++] = v;
  };
  /** Runs the search from queue position `head` on, along the links or (`both`) against them too. */
  const search = (head: number, both: boolean): void => {
    for (let h = head; h < tail; h++) {
      const u = queue[h]!;
      for (let e = outStart[u]!; e < outStart[u + 1]!; e++) {
        const k = outLinks[e]!;
        reach(target[k]!, u, k);
      }
      if (!both) continue;
      for (let e = inStart[u]!; e < inStart[u + 1]!; e++) {
        const k = inLinks[e]!;
        reach(source[k]!, u, k);
      }
    }
  };

  for (let i = 0; i < n; i++) if (inStart[i + 1] === inStart[i]) reach(i, -1, -1);
  search(0, false);
  search(0, true);
  // What is left has no source node: components where every node has an incoming link.
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue;
    const head = tail;
    reach(i, -1, -1);
    search(head, false);
    search(head, true);
  }
}

/** A mask of the collapsed nodes, or `undefined` when none is. */
function collapsedMask(collapsed: CollapsedInput | undefined, n: number): Uint8Array | undefined {
  // Options come from a figure: anything that cannot be walked is no collapsed node.
  if (collapsed == null || typeof collapsed[Symbol.iterator] !== 'function') return undefined;
  const mask = new Uint8Array(n);
  let any = false;
  if (collapsed instanceof Uint8Array) {
    for (let i = Math.min(n, collapsed.length) - 1; i >= 0; i--) {
      if (!collapsed[i]) continue;
      mask[i] = 1;
      any = true;
    }
  } else {
    for (const i of collapsed) {
      if (!Number.isInteger(i) || i < 0 || i >= n) continue;
      mask[i] = 1;
      any = true;
    }
  }
  return any ? mask : undefined;
}

/**
 * The view a layout draws: sorts siblings (`sort`, `sortOrder`) and leaves out what is below the
 * `collapsed` nodes.
 *
 * `'size'` sorts by the number of nodes in a subtree and `'value'` by `graph.value` (nodes without
 * one last), largest first unless `sortOrder` is `'ascending'`; equal keys keep input order. Sizes
 * count hidden nodes too, so folding a subtree does not reorder its siblings.
 */
export function viewForest(
  forest: Forest,
  graph: LayoutGraph,
  options: TreeViewOptions = {},
): TreeView {
  const n = forest.nodes;
  const { parent } = forest;
  const sort = options.sort === 'size' || options.sort === 'value' ? options.sort : 'input';

  let children = forest.children;
  let roots = forest.roots;
  if (sort !== 'input') {
    const key = new Float64Array(n);
    const sign = options.sortOrder === 'ascending' ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const v = sort === 'size' ? forest.size[i]! : (graph.value?.[i] ?? NaN);
      // Nodes without a value sort last whichever way the order runs.
      key[i] = Number.isFinite(v) ? sign * v : Infinity;
    }
    // Input position among the siblings, to break ties: a stable sort whatever the engine does.
    const position = new Int32Array(n);
    for (let c = 0; c < children.length; c++) position[children[c]!] = c;
    for (let r = 0; r < roots.length; r++) position[roots[r]!] = r;
    const byKey = (a: number, b: number): number =>
      key[a]! - key[b]! || position[a]! - position[b]!;
    children = children.slice();
    roots = roots.slice().sort(byKey);
    for (let i = 0; i < n; i++) {
      const start = forest.childStart[i]!;
      const end = forest.childStart[i + 1]!;
      if (end - start > 1) children.subarray(start, end).sort(byKey);
    }
  }

  const collapsed = collapsedMask(options.collapsed, n);
  const childStart = forest.childStart.subarray(0, n);
  const childEnd = forest.childStart.slice(1, n + 1);
  const hidden = new Uint8Array(n);
  if (collapsed) {
    for (let s = 0; s < n; s++) {
      const v = forest.order[s]!;
      const p = parent[v]!;
      if (p >= 0 && (hidden[p] || collapsed[p])) hidden[v] = 1;
    }
    for (let i = 0; i < n; i++) if (collapsed[i] || hidden[i]) childEnd[i] = childStart[i]!;
  }

  // Preorder over what is left, in drawing order.
  let visible = n;
  if (collapsed) for (let i = 0; i < n; i++) visible -= hidden[i]!;
  const order = new Int32Array(visible);
  const stack = new Int32Array(visible);
  let count = 0;
  let top = 0;
  for (let r = roots.length - 1; r >= 0; r--) stack[top++] = roots[r]!;
  while (top > 0) {
    const v = stack[--top]!;
    order[count++] = v;
    for (let c = childEnd[v]! - 1; c >= childStart[v]!; c--) stack[top++] = children[c]!;
  }

  return { forest, hidden, roots, childStart, childEnd, children, order };
}
