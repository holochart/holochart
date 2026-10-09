/**
 * The few graph measures people color and size nodes by (backlog G9): degree, connected
 * components and communities (Louvain), and the adjacency matrix in an order that shows them.
 * Anything past these belongs to a graph library (graphology, networkx), not to a chart library.
 *
 * All of them are pure and deterministic: nodes are visited in index order and ties go to the
 * lower index, so the same graph gives the same numbers everywhere.
 */
import { nodeCount, validIndex, type GraphLike } from './types.ts';

/** Options shared by the measures. */
export interface MetricOptions {
  /** Number of nodes, when the graph has no `node.label` to count. */
  readonly nodes?: number;
}

/** The weight of link `k`: its `value` when that is a positive finite number, else 1. */
function weightOf(graph: GraphLike, k: number): number {
  const v = graph.link.value?.[k];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 1;
}

// ---- Degree -------------------------------------------------------------------------------------

/** Degrees of every node. */
export interface Degrees {
  /** Links at the node, a self-link counted twice: `indegree + outdegree`. */
  readonly degree: Float64Array;
  /** Links that point at the node. */
  readonly indegree: Float64Array;
  /** Links that leave the node. */
  readonly outdegree: Float64Array;
}

/**
 * The degree of every node. With `weighted`, each link counts as its `value` (the node's
 * strength). Links with an end that is not a node are skipped.
 */
export function degrees(
  graph: GraphLike,
  options: MetricOptions & { readonly weighted?: boolean } = {},
): Degrees {
  const n = nodeCount(graph, options.nodes);
  const indegree = new Float64Array(n);
  const outdegree = new Float64Array(n);
  const degree = new Float64Array(n);
  const { source, target } = graph.link;
  for (let k = 0; k < source.length; k++) {
    const s = source[k];
    const t = target[k];
    if (!validIndex(s, n) || !validIndex(t, n)) continue;
    const w = options.weighted === true ? weightOf(graph, k) : 1;
    outdegree[s] = (outdegree[s] as number) + w;
    indegree[t] = (indegree[t] as number) + w;
  }
  for (let i = 0; i < n; i++) degree[i] = (indegree[i] as number) + (outdegree[i] as number);
  return { degree, indegree, outdegree };
}

// ---- Connected components -----------------------------------------------------------------------

/** The connected components of a graph. */
export interface Components {
  /** Component of each node, numbered from 0 in the order of each component's first node. */
  readonly component: Int32Array;
  readonly count: number;
  /** Number of nodes in each component. */
  readonly sizes: Int32Array;
}

/**
 * Connected components, ignoring the direction of links (the weak components of a directed
 * graph). A node without links is a component of its own.
 */
export function connectedComponents(graph: GraphLike, options: MetricOptions = {}): Components {
  const n = nodeCount(graph, options.nodes);
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root] as number;
    while (parent[i] !== root) {
      const next = parent[i] as number;
      parent[i] = root;
      i = next;
    }
    return root;
  };
  const { source, target } = graph.link;
  for (let k = 0; k < source.length; k++) {
    const s = source[k];
    const t = target[k];
    if (!validIndex(s, n) || !validIndex(t, n)) continue;
    const a = find(s);
    const b = find(t);
    // The lower index is the root, so a component is named by its first node.
    if (a < b) parent[b] = a;
    else if (b < a) parent[a] = b;
  }
  const component = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (component[root] === -1) {
      component[root] = sizes.length;
      sizes.push(0);
    }
    const c = component[root] as number;
    component[i] = c;
    sizes[c] = (sizes[c] as number) + 1;
  }
  return { component, count: sizes.length, sizes: Int32Array.from(sizes) };
}

// ---- Communities (Louvain) ----------------------------------------------------------------------

/** Options of {@link louvain} and {@link modularity}. */
export interface CommunityOptions extends MetricOptions {
  /**
   * Resolution of the modularity being optimised: above 1 gives more and smaller communities,
   * below 1 fewer and larger. Default 1.
   */
  readonly resolution?: number;
}

/** An undirected weighted graph in compressed rows, with self-links kept apart. */
interface Level {
  readonly n: number;
  readonly start: Int32Array;
  readonly neighbour: Int32Array;
  readonly weight: Float64Array;
  /** Weight of each node's self-link. */
  readonly loop: Float64Array;
  /** Weighted degree: the node's link weights, its self-link counted twice. */
  readonly k: Float64Array;
}

/** Rows from a list of undirected pairs `(a[e], b[e], w[e])`, `a !== b`; parallel pairs stay. */
function toLevel(
  n: number,
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  w: ArrayLike<number>,
  loop: Float64Array,
): Level {
  const start = new Int32Array(n + 1);
  for (let e = 0; e < a.length; e++) {
    start[(a[e] as number) + 1] = (start[(a[e] as number) + 1] as number) + 1;
    start[(b[e] as number) + 1] = (start[(b[e] as number) + 1] as number) + 1;
  }
  for (let i = 0; i < n; i++) start[i + 1] = (start[i + 1] as number) + (start[i] as number);
  const fill = start.slice(0, n);
  const neighbour = new Int32Array(a.length * 2);
  const weight = new Float64Array(a.length * 2);
  const k = new Float64Array(n);
  const put = (from: number, to: number, value: number): void => {
    const at = fill[from] as number;
    fill[from] = at + 1;
    neighbour[at] = to;
    weight[at] = value;
    k[from] = (k[from] as number) + value;
  };
  for (let e = 0; e < a.length; e++) {
    put(a[e] as number, b[e] as number, w[e] as number);
    put(b[e] as number, a[e] as number, w[e] as number);
  }
  for (let i = 0; i < n; i++) k[i] = (k[i] as number) + 2 * (loop[i] as number);
  return { n, start, neighbour, weight, loop, k };
}

function firstLevel(graph: GraphLike, n: number): Level {
  const a: number[] = [];
  const b: number[] = [];
  const w: number[] = [];
  const loop = new Float64Array(n);
  const { source, target } = graph.link;
  for (let e = 0; e < source.length; e++) {
    const s = source[e];
    const t = target[e];
    if (!validIndex(s, n) || !validIndex(t, n)) continue;
    const value = weightOf(graph, e);
    if (s === t) {
      loop[s] = (loop[s] as number) + value;
    } else {
      a.push(s);
      b.push(t);
      w.push(value);
    }
  }
  return toLevel(n, a, b, w, loop);
}

/**
 * One round of local moves: each node in turn joins the neighbouring community that raises
 * modularity most, until a whole pass moves nothing. Returns each node's community (not
 * renumbered) and whether any node moved.
 */
function localMoves(level: Level, m2: number, resolution: number): [Int32Array, boolean] {
  const { n, start, neighbour, weight, k } = level;
  const community = new Int32Array(n);
  const total = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    community[i] = i;
    total[i] = k[i] as number;
  }
  // Weight from the node being moved to each community next to it; `stamp` says in which visit
  // an entry was last reset, so the array is never cleared whole.
  const toCommunity = new Float64Array(n);
  const stamp = new Int32Array(n).fill(-1);
  const touched = new Int32Array(n);
  let improved = false;
  let visit = 0;
  // The bound keeps a (never observed) cycle of moves finite; real graphs settle in a few passes.
  for (let pass = 0; pass < 100; pass++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const own = community[i] as number;
      const ki = k[i] as number;
      let count = 0;
      visit++;
      stamp[own] = visit;
      toCommunity[own] = 0;
      touched[count++] = own;
      for (let e = start[i] as number; e < (start[i + 1] as number); e++) {
        const c = community[neighbour[e] as number] as number;
        if (stamp[c] !== visit) {
          stamp[c] = visit;
          toCommunity[c] = 0;
          touched[count++] = c;
        }
        toCommunity[c] = (toCommunity[c] as number) + (weight[e] as number);
      }
      total[own] = (total[own] as number) - ki;
      const gainOf = (c: number): number =>
        (toCommunity[c] as number) - (resolution * (total[c] as number) * ki) / m2;
      // Its own community is the first candidate, so a tie moves nothing; among the others a
      // tie goes to the one met first, which is the same on every run.
      let best = own;
      let bestGain = gainOf(own);
      for (let t = 1; t < count; t++) {
        const c = touched[t] as number;
        const gain = gainOf(c);
        if (gain > bestGain + 1e-12) {
          best = c;
          bestGain = gain;
        }
      }
      total[best] = (total[best] as number) + ki;
      if (best !== own) {
        community[i] = best;
        moved++;
      }
    }
    if (moved === 0) break;
    improved = true;
  }
  return [community, improved];
}

/** Number `labels` from 0 in order of first appearance; returns the new labels and their count. */
function renumber(labels: Int32Array): [Int32Array, number] {
  const map = new Int32Array(labels.length).fill(-1);
  const out = new Int32Array(labels.length);
  let count = 0;
  for (let i = 0; i < labels.length; i++) {
    const c = labels[i] as number;
    if (map[c] === -1) map[c] = count++;
    out[i] = map[c] as number;
  }
  return [out, count];
}

/** The graph of communities: one node per community, link weights summed. */
function aggregate(level: Level, community: Int32Array, count: number): Level {
  const loop = new Float64Array(count);
  const sums = new Map<number, number>();
  for (let i = 0; i < level.n; i++) {
    const ci = community[i] as number;
    loop[ci] = (loop[ci] as number) + (level.loop[i] as number);
    for (let e = level.start[i] as number; e < (level.start[i + 1] as number); e++) {
      const j = level.neighbour[e] as number;
      // Each undirected link is in both rows: take it from its lower end.
      if (j < i) continue;
      const cj = community[j] as number;
      const w = level.weight[e] as number;
      if (ci === cj) {
        loop[ci] = (loop[ci] as number) + w;
      } else {
        const key = ci < cj ? ci * count + cj : cj * count + ci;
        sums.set(key, (sums.get(key) ?? 0) + w);
      }
    }
  }
  // Sorted keys: a Map keeps insertion order, which is already deterministic, but sorted rows
  // also make the next round's visiting order independent of how this level was built.
  const keys = [...sums.keys()].sort((p, q) => p - q);
  const a = new Int32Array(keys.length);
  const b = new Int32Array(keys.length);
  const w = new Float64Array(keys.length);
  keys.forEach((key, e) => {
    a[e] = Math.floor(key / count);
    b[e] = key % count;
    w[e] = sums.get(key) as number;
  });
  return toLevel(count, a, b, w, loop);
}

/**
 * Communities by the Louvain method (Blondel et al. 2008): the community of each node, numbered
 * from 0 in the order of each community's first node. Links are read as undirected and weighted
 * by `link.value`. Deterministic: there is no random node order, so the result is one of the
 * partitions Louvain can find, always the same one.
 */
export function louvain(graph: GraphLike, options: CommunityOptions = {}): Int32Array {
  const n = nodeCount(graph, options.nodes);
  const resolution = options.resolution ?? 1;
  let level = firstLevel(graph, n);
  let m2 = 0;
  for (let i = 0; i < n; i++) m2 += level.k[i] as number;
  const assignment = new Int32Array(n);
  for (let i = 0; i < n; i++) assignment[i] = i;
  if (m2 === 0) return assignment;
  for (;;) {
    const [moved, improved] = localMoves(level, m2, resolution);
    if (!improved) break;
    const [community, count] = renumber(moved);
    for (let i = 0; i < n; i++) assignment[i] = community[assignment[i] as number] as number;
    if (count === level.n) break;
    level = aggregate(level, community, count);
  }
  return renumber(assignment)[0];
}

/**
 * Modularity of a partition (Newman and Girvan): the share of link weight inside communities
 * minus what a random graph with the same degrees would have. Between −0.5 and 1; 0 for one
 * community holding everything.
 */
export function modularity(
  graph: GraphLike,
  communities: ArrayLike<number>,
  options: CommunityOptions = {},
): number {
  const n = nodeCount(graph, options.nodes);
  const resolution = options.resolution ?? 1;
  const level = firstLevel(graph, n);
  let m2 = 0;
  for (let i = 0; i < n; i++) m2 += level.k[i] as number;
  if (m2 === 0) return 0;
  const inside = new Map<number, number>();
  const total = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const c = communities[i] as number;
    total.set(c, (total.get(c) ?? 0) + (level.k[i] as number));
    let w = 2 * (level.loop[i] as number);
    for (let e = level.start[i] as number; e < (level.start[i + 1] as number); e++) {
      if (communities[level.neighbour[e] as number] === c) w += level.weight[e] as number;
    }
    inside.set(c, (inside.get(c) ?? 0) + w);
  }
  let q = 0;
  for (const [c, t] of total) q += (inside.get(c) ?? 0) / m2 - resolution * (t / m2) ** 2;
  return q;
}

// ---- Adjacency matrix ---------------------------------------------------------------------------

/** Options of {@link adjacencyMatrix}. */
export interface AdjacencyOptions extends MetricOptions {
  /**
   * The order of rows and columns: `'input'` (as given), `'degree'` (most connected first),
   * `'group'` (by `node.group`, then degree), `'community'` (by {@link louvain} community, the
   * largest first, then degree), or a list of node indices. Default `'community'`: it is the
   * order that makes clusters show as blocks on the diagonal.
   */
  readonly order?: 'input' | 'degree' | 'group' | 'community' | readonly number[];
}

/** A graph as a matrix: the `x`, `y` and `z` of a `heatmap` trace. */
export interface AdjacencyMatrix {
  /** Column labels (link targets), in `order`. */
  readonly x: string[];
  /** Row labels (link sources), in `order`. */
  readonly y: string[];
  /** `z[row][column]`: the summed `value` of the links from the row's node to the column's. */
  readonly z: number[][];
  /** Node index of each row and column. */
  readonly order: number[];
}

/**
 * The adjacency matrix of a graph, with rows and columns reordered so that its structure shows
 * (backlog G8): it reads at densities where a node-link drawing is a hairball. Draw it with
 * `{ type: 'heatmap', x, y, z }`. An undirected graph (`directed: false`) fills both triangles.
 */
export function adjacencyMatrix(graph: GraphLike, options: AdjacencyOptions = {}): AdjacencyMatrix {
  const n = nodeCount(graph, options.nodes);
  const order = matrixOrder(graph, n, options.order ?? 'community');
  const position = new Int32Array(n).fill(-1);
  order.forEach((node, at) => (position[node] = at));
  const z = order.map(() => new Array<number>(order.length).fill(0));
  const { source, target } = graph.link;
  for (let k = 0; k < source.length; k++) {
    const s = source[k];
    const t = target[k];
    if (!validIndex(s, n) || !validIndex(t, n)) continue;
    const r = position[s] as number;
    const c = position[t] as number;
    if (r < 0 || c < 0) continue;
    const w = weightOf(graph, k);
    (z[r] as number[])[c] = ((z[r] as number[])[c] as number) + w;
    if (graph.directed === false && r !== c) {
      (z[c] as number[])[r] = ((z[c] as number[])[r] as number) + w;
    }
  }
  const labels = order.map((i) => {
    const label = graph.node?.label?.[i];
    return typeof label === 'string' || typeof label === 'number' ? String(label) : String(i);
  });
  return { x: labels, y: labels.slice(), z, order };
}

function matrixOrder(graph: GraphLike, n: number, order: AdjacencyOptions['order']): number[] {
  if (typeof order !== 'string') {
    const out: number[] = [];
    const used = new Uint8Array(n);
    for (const i of order ?? []) {
      if (validIndex(i, n) && used[i] === 0) {
        used[i] = 1;
        out.push(i);
      }
    }
    return out;
  }
  const indices = Array.from({ length: n }, (_, i) => i);
  if (order === 'input') return indices;
  const { degree } = degrees(graph, { nodes: n, weighted: true });
  const byDegree = (p: number, q: number): number =>
    (degree[q] as number) - (degree[p] as number) || p - q;
  if (order === 'degree') return indices.sort(byDegree);

  // A rank per node's block (its group or community), then degree inside the block.
  const block = new Int32Array(n);
  if (order === 'group') {
    const ranks = new Map<unknown, number>();
    for (let i = 0; i < n; i++) {
      const g = graph.node?.group?.[i] ?? null;
      if (!ranks.has(g)) ranks.set(g, ranks.size);
      block[i] = ranks.get(g) as number;
    }
  } else {
    const community = louvain(graph, { nodes: n });
    const sizes = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      sizes.set(community[i] as number, (sizes.get(community[i] as number) ?? 0) + 1);
    }
    // Largest community first; equal sizes keep the order of their first nodes.
    const ranked = [...sizes.keys()].sort(
      (p, q) => (sizes.get(q) as number) - (sizes.get(p) as number) || p - q,
    );
    const rank = new Map(ranked.map((c, r) => [c, r]));
    for (let i = 0; i < n; i++) block[i] = rank.get(community[i] as number) as number;
  }
  return indices.sort((p, q) => (block[p] as number) - (block[q] as number) || byDegree(p, q));
}
