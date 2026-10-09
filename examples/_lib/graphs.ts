import { rng } from './rng.ts';

/** A graph without positions, as the layout examples of the `graph` trace take it. */
export interface GraphData {
  label: string[];
  group: string[];
  source: number[];
  target: number[];
}

/** Options of {@link communityGraph}. */
export interface CommunityGraphOptions {
  seed?: number;
  /** Number of communities, and nodes in each. */
  communities: number;
  size: number;
  /** Chance of a link between two nodes of one community, and of two different ones. */
  inside: number;
  between: number;
}

/**
 * A planted-partition graph, for examples: every pair of nodes of one community is linked with
 * probability `inside`, every other pair with probability `between`. Each node is tied to the one
 * before it in its community first, so no community falls apart. Deterministic for a seed.
 */
export function communityGraph(options: CommunityGraphOptions): GraphData {
  const random = rng(options.seed ?? 5);
  const { communities, size } = options;
  const out: GraphData = { label: [], group: [], source: [], target: [] };
  const n = communities * size;
  for (let i = 0; i < n; i++) {
    const c = Math.floor(i / size);
    out.label.push(`${String.fromCharCode(65 + (c % 26))}${(i % size) + 1}`);
    out.group.push(`Team ${String.fromCharCode(65 + (c % 26))}`);
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const same = Math.floor(i / size) === Math.floor(j / size);
      const chain = same && j === i + 1;
      if (chain || random() < (same ? options.inside : options.between)) {
        out.source.push(i);
        out.target.push(j);
      }
    }
  }
  return out;
}

/**
 * A small-world graph (Watts–Strogatz): `nodes` on a ring, each linked to its `neighbours` next
 * ones, and each link moved to a random node with probability `rewire`. Deterministic for a seed.
 */
export function smallWorld(nodes: number, neighbours: number, rewire: number, seed = 9): GraphData {
  const random = rng(seed);
  const out: GraphData = { label: [], group: [], source: [], target: [] };
  const linked = new Set<number>();
  const key = (a: number, b: number): number => Math.min(a, b) * nodes + Math.max(a, b);
  for (let i = 0; i < nodes; i++) out.label.push(String(i + 1));
  for (let i = 0; i < nodes; i++) {
    for (let k = 1; k <= neighbours; k++) {
      let j = (i + k) % nodes;
      if (random() < rewire) {
        const other = Math.floor(random() * nodes);
        if (other !== i && !linked.has(key(i, other))) j = other;
      }
      if (linked.has(key(i, j))) continue;
      linked.add(key(i, j));
      out.source.push(i);
      out.target.push(j);
    }
  }
  return out;
}

/**
 * A graph with hubs (preferential attachment): every new node links to `links` earlier nodes,
 * chosen in proportion to the links they already have. Deterministic for a seed.
 */
export function hubGraph(nodes: number, links: number, seed = 4): GraphData {
  const random = rng(seed);
  const out: GraphData = { label: [], group: [], source: [], target: [] };
  // One entry per link end: a draw from it is a draw in proportion to degree.
  const ends: number[] = [0];
  for (let i = 0; i < nodes; i++) {
    out.label.push(`n${i + 1}`);
    if (i === 0) continue;
    const chosen = new Set<number>();
    for (let k = 0; k < Math.min(links, i); k++) {
      let to = ends[Math.floor(random() * ends.length)]!;
      for (let tries = 0; chosen.has(to) && tries < 8; tries++) {
        to = ends[Math.floor(random() * ends.length)]!;
      }
      if (chosen.has(to)) continue;
      chosen.add(to);
      out.source.push(to);
      out.target.push(i);
      ends.push(to, i);
    }
    if (chosen.size === 0) ends.push(i);
  }
  return out;
}

/** Options of {@link largeGraph}. */
export interface LargeGraphOptions {
  nodes: number;
  links: number;
  /** Number of communities the nodes are dealt into, in turn. Default 12. */
  communities?: number;
  /** Share of the links that join two communities. Default 0.04. */
  between?: number;
  seed?: number;
}

/**
 * A large graph with communities, in time linear in its size (`communityGraph` looks at every
 * pair of nodes, which is too slow from a few thousand on): every node is tied to an earlier node
 * of its community, and the remaining links join two random nodes, of one community but for a
 * share of `between`. Inside a community the earlier nodes are drawn more often, which gives it
 * hubs. Deterministic for a seed.
 */
export function largeGraph(options: LargeGraphOptions): GraphData {
  const random = rng(options.seed ?? 11);
  const { nodes, links } = options;
  const communities = Math.max(1, Math.min(nodes, options.communities ?? 12));
  const between = options.between ?? 0.04;
  const out: GraphData = { label: [], group: [], source: [], target: [] };
  // Node i is member ⌊i / communities⌋ of community i mod communities.
  const members = (c: number): number => Math.ceil((nodes - c) / communities);
  const pick = (c: number): number => {
    const r = random();
    return c + communities * Math.floor(r * r * members(c));
  };
  for (let i = 0; i < nodes; i++) {
    const c = i % communities;
    out.label.push(`${String.fromCharCode(65 + (c % 26))}${Math.floor(i / communities) + 1}`);
    out.group.push(`Community ${c + 1}`);
    if (i < communities) continue;
    const m = Math.floor(i / communities);
    out.source.push(c + communities * Math.floor(random() * random() * m));
    out.target.push(i);
  }
  while (out.source.length < links) {
    const a = Math.floor(random() * communities);
    const b = random() < between ? Math.floor(random() * communities) : a;
    const from = pick(a);
    const to = pick(b);
    if (from === to) continue;
    out.source.push(from);
    out.target.push(to);
  }
  return out;
}
