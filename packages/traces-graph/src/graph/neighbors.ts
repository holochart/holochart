/**
 * Who is next to whom in a `graph` trace (backlog G5): the adjacency of the model's links, the
 * neighbourhood of a node within a number of hops, and a shortest path between two nodes. Pure,
 * on typed arrays, and deterministic: the first of several equally short paths is the one that
 * follows the links with the lowest indices.
 *
 * Links are the model's kept links (`GraphModel.source` / `target`), so a link index here is a
 * position in those arrays, not in the trace's own (`GraphModel.linkIndex` maps back).
 */

/**
 * The links at every node, in compressed rows: the links that leave node `i` are
 * `outLink[outStart[i] … outStart[i + 1])` and lead to the same entries of `outNode`; `in…` are
 * the links that end at it and where they come from. A self-link is in both rows of its node.
 */
export interface Adjacency {
  readonly nodes: number;
  readonly links: number;
  readonly outStart: Uint32Array;
  readonly outNode: Int32Array;
  readonly outLink: Int32Array;
  readonly inStart: Uint32Array;
  readonly inNode: Int32Array;
  readonly inLink: Int32Array;
}

/** Which links are followed from a node: all of them, those that leave it, those that end at it. */
export type LinkDirection = 'both' | 'out' | 'in';

function rows(
  nodes: number,
  from: Int32Array,
  to: Int32Array,
): { start: Uint32Array; node: Int32Array; link: Int32Array } {
  const links = from.length;
  const start = new Uint32Array(nodes + 1);
  for (let k = 0; k < links; k++) start[from[k]! + 1]!++;
  for (let i = 0; i < nodes; i++) start[i + 1]! += start[i]!;
  const fill = Uint32Array.from(start.subarray(0, nodes));
  const node = new Int32Array(links);
  const link = new Int32Array(links);
  // In link order, so that the links of a node are met lowest index first.
  for (let k = 0; k < links; k++) {
    const at = fill[from[k]!]!++;
    node[at] = to[k]!;
    link[at] = k;
  }
  return { start, node, link };
}

/** The adjacency of `nodes` nodes and the links `source[k]` → `target[k]` (all ends in range). */
export function buildAdjacency(nodes: number, source: Int32Array, target: Int32Array): Adjacency {
  const out = rows(nodes, source, target);
  const into = rows(nodes, target, source);
  return {
    nodes,
    links: source.length,
    outStart: out.start,
    outNode: out.node,
    outLink: out.link,
    inStart: into.start,
    inNode: into.node,
    inLink: into.link,
  };
}

/** How many other nodes each node is linked to, whatever the direction and however many links. */
export function neighborCounts(adjacency: Adjacency): Int32Array {
  const { nodes } = adjacency;
  const counts = new Int32Array(nodes);
  // `seen[j] === i + 1`: `j` was already counted for node `i`.
  const seen = new Int32Array(nodes);
  for (let i = 0; i < nodes; i++) {
    let count = 0;
    const visit = (j: number): void => {
      if (j === i || seen[j] === i + 1) return;
      seen[j] = i + 1;
      count++;
    };
    for (let e = adjacency.outStart[i]!; e < adjacency.outStart[i + 1]!; e++) {
      visit(adjacency.outNode[e]!);
    }
    for (let e = adjacency.inStart[i]!; e < adjacency.inStart[i + 1]!; e++) {
      visit(adjacency.inNode[e]!);
    }
    counts[i] = count;
  }
  return counts;
}

/** A set of nodes and links as flags: 1 where the node or the link is in it. */
export interface GraphSubset {
  readonly node: Uint8Array;
  readonly link: Uint8Array;
}

/** What {@link neighborhood} and {@link shortestPath} leave out. */
export interface WalkLimits {
  /** 1 for the nodes that are not there (not drawn): nothing passes through them. */
  readonly hiddenNodes?: Uint8Array | undefined;
  /** 1 for the links that are not there. */
  readonly hiddenLinks?: Uint8Array | undefined;
}

/**
 * The nodes within `hops` links of the `seeds`, and the links that lead to them: every link
 * followed from a node that is fewer than `hops` away. So one hop is a node, its links and its
 * neighbours, without the links between two neighbours; `hops` 0 is the seeds alone.
 * `direction` says which links are followed from each node on the way: `'out'` gives what a node
 * leads to, `'in'` what leads to it.
 */
export function neighborhood(
  adjacency: Adjacency,
  seeds: readonly number[],
  hops: number,
  direction: LinkDirection = 'both',
  limits: WalkLimits = {},
): GraphSubset {
  const { nodes, links } = adjacency;
  const node = new Uint8Array(nodes);
  const link = new Uint8Array(links);
  const { hiddenNodes, hiddenLinks } = limits;
  let frontier: number[] = [];
  for (const s of seeds) {
    if (!(s >= 0 && s < nodes) || node[s] === 1 || hiddenNodes?.[s] === 1) continue;
    node[s] = 1;
    frontier.push(s);
  }
  const depth = Number.isFinite(hops) ? Math.max(0, Math.floor(hops)) : nodes;
  for (let d = 0; d < depth && frontier.length > 0; d++) {
    const next: number[] = [];
    const follow = (start: Uint32Array, to: Int32Array, via: Int32Array, i: number): void => {
      for (let e = start[i]!; e < start[i + 1]!; e++) {
        const k = via[e]!;
        const j = to[e]!;
        if (hiddenLinks?.[k] === 1 || hiddenNodes?.[j] === 1) continue;
        link[k] = 1;
        if (node[j] === 1) continue;
        node[j] = 1;
        next.push(j);
      }
    };
    for (const i of frontier) {
      if (direction !== 'in') follow(adjacency.outStart, adjacency.outNode, adjacency.outLink, i);
      if (direction !== 'out') follow(adjacency.inStart, adjacency.inNode, adjacency.inLink, i);
    }
    frontier = next;
  }
  return { node, link };
}

/** A path through a graph: its nodes in order, the links between them, and what it costs. */
export interface GraphPath {
  /** Node indices from the first node to the last; one node when the two are the same. */
  readonly nodes: number[];
  /** The link between each node and the next (one fewer than `nodes`). */
  readonly links: number[];
  /** The number of links, or the sum of their costs when costs were given. */
  readonly length: number;
}

/** How {@link shortestPath} walks. */
export interface PathOptions extends WalkLimits {
  /** Follow a link only from its source to its target. Default `false`: either way. */
  readonly directed?: boolean | undefined;
  /**
   * What each link costs (one entry per link). A link whose cost is not a positive finite number
   * costs 1. Unset: every link costs 1, and the path is the one with the fewest links.
   */
  readonly cost?: ArrayLike<number> | undefined;
}

/** A binary min-heap of node indices keyed by a distance array. */
class NodeHeap {
  readonly #items: number[] = [];
  readonly #key: Float64Array;

  constructor(key: Float64Array) {
    this.#key = key;
  }

  get size(): number {
    return this.#items.length;
  }

  #before(a: number, b: number): boolean {
    const ka = this.#key[a]!;
    const kb = this.#key[b]!;
    return ka < kb || (ka === kb && a < b);
  }

  push(i: number): void {
    const items = this.#items;
    let at = items.length;
    items.push(i);
    while (at > 0) {
      const up = (at - 1) >> 1;
      if (!this.#before(items[at]!, items[up]!)) break;
      [items[at], items[up]] = [items[up]!, items[at]!];
      at = up;
    }
  }

  pop(): number {
    const items = this.#items;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let at = 0;
      for (;;) {
        const l = 2 * at + 1;
        const r = l + 1;
        let least = at;
        if (l < items.length && this.#before(items[l]!, items[least]!)) least = l;
        if (r < items.length && this.#before(items[r]!, items[least]!)) least = r;
        if (least === at) break;
        [items[at], items[least]] = [items[least]!, items[at]!];
        at = least;
      }
    }
    return top;
  }
}

/**
 * A shortest path from node `from` to node `to`, or `undefined` when there is none (or an end is
 * not a node, or is hidden). Without costs it has the fewest links (breadth first); with costs
 * the smallest sum (Dijkstra). Of several equally short paths it is the one found first: nodes
 * are taken nearest first and a node's links lowest index first, those that leave it before those
 * that end at it.
 */
export function shortestPath(
  adjacency: Adjacency,
  from: number,
  to: number,
  options: PathOptions = {},
): GraphPath | undefined {
  const { nodes } = adjacency;
  const { hiddenNodes, hiddenLinks, cost } = options;
  const inRange = (i: number): boolean => Number.isInteger(i) && i >= 0 && i < nodes;
  if (!inRange(from) || !inRange(to)) return undefined;
  if (hiddenNodes?.[from] === 1 || hiddenNodes?.[to] === 1) return undefined;
  if (from === to) return { nodes: [from], links: [], length: 0 };

  const distance = new Float64Array(nodes).fill(Infinity);
  // The link a node was reached by, and the node it was reached from.
  const viaLink = new Int32Array(nodes).fill(-1);
  const viaNode = new Int32Array(nodes).fill(-1);
  const done = new Uint8Array(nodes);
  const costOf = (k: number): number => {
    const c = cost?.[k];
    return typeof c === 'number' && c > 0 && c < Infinity ? c : 1;
  };
  distance[from] = 0;

  const relax = (
    start: Uint32Array,
    next: Int32Array,
    via: Int32Array,
    i: number,
    reached: (j: number) => void,
  ): void => {
    for (let e = start[i]!; e < start[i + 1]!; e++) {
      const k = via[e]!;
      const j = next[e]!;
      if (j === i || done[j] === 1 || hiddenLinks?.[k] === 1 || hiddenNodes?.[j] === 1) continue;
      const d = distance[i]! + costOf(k);
      if (d < distance[j]!) {
        distance[j] = d;
        viaLink[j] = k;
        viaNode[j] = i;
        reached(j);
      }
    }
  };
  const expand = (i: number, reached: (j: number) => void): void => {
    relax(adjacency.outStart, adjacency.outNode, adjacency.outLink, i, reached);
    if (options.directed !== true) {
      relax(adjacency.inStart, adjacency.inNode, adjacency.inLink, i, reached);
    }
  };

  if (cost) {
    const heap = new NodeHeap(distance);
    heap.push(from);
    while (heap.size > 0) {
      const i = heap.pop();
      if (done[i] === 1) continue;
      done[i] = 1;
      if (i === to) break;
      // A node may be pushed again with a smaller distance; the stale entry is skipped above.
      expand(i, (j) => heap.push(j));
    }
  } else {
    let frontier = [from];
    done[from] = 1;
    while (frontier.length > 0 && done[to] !== 1) {
      const next: number[] = [];
      for (const i of frontier) {
        expand(i, (j) => {
          // Breadth first, the first way in is a shortest one: the node is settled at once.
          done[j] = 1;
          next.push(j);
        });
      }
      frontier = next;
    }
  }
  if (!(distance[to]! < Infinity)) return undefined;

  const pathNodes: number[] = [];
  const pathLinks: number[] = [];
  for (let i = to; i !== from; i = viaNode[i]!) {
    pathNodes.push(i);
    pathLinks.push(viaLink[i]!);
  }
  pathNodes.push(from);
  pathNodes.reverse();
  pathLinks.reverse();
  return { nodes: pathNodes, links: pathLinks, length: distance[to]! };
}
