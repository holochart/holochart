/**
 * Graphs and measures for the force layout's tests: small builders of {@link LayoutGraph}s (every
 * node free and 8 units across unless said otherwise), seeded random graphs, and distances over a
 * result.
 */
import type { LayoutGraph, LayoutResult, LayoutSimulation } from '../../types.ts';

/** A link as `[source, target]` or `[source, target, weight]`. */
export type LinkSpec = readonly [number, number, number?];

export interface GraphExtras {
  /** Given coordinates by node index; a missing entry or `NaN` leaves the node free. */
  readonly x?: readonly number[];
  readonly y?: readonly number[];
  readonly z?: readonly number[];
  readonly group?: readonly number[];
  /** Half extent of every node (default 4), or one per node. */
  readonly size?: number | readonly number[];
}

const coordinates = (values: readonly number[] | undefined, nodes: number): Float64Array =>
  Float64Array.from({ length: nodes }, (_, i) => values?.[i] ?? NaN);

export function makeGraph(
  nodes: number,
  links: readonly LinkSpec[] = [],
  extras: GraphExtras = {},
): LayoutGraph {
  const size = extras.size ?? 4;
  const half = Float64Array.from({ length: nodes }, (_, i) =>
    typeof size === 'number' ? size : (size[i] ?? 4),
  );
  const group = extras.group ? Int32Array.from(extras.group) : undefined;
  return {
    nodes,
    source: Int32Array.from(links, (l) => l[0]),
    target: Int32Array.from(links, (l) => l[1]),
    weight: Float64Array.from(links, (l) => l[2] ?? 1),
    halfWidth: half,
    halfHeight: half,
    x: coordinates(extras.x, nodes),
    y: coordinates(extras.y, nodes),
    ...(extras.z ? { z: coordinates(extras.z, nodes) } : {}),
    ...(group ? { group, groups: Math.max(-1, ...extras.group!) + 1 } : {}),
  };
}

/** `0 – 1 – 2 – … – (n − 1)`. */
export const pathLinks = (n: number): LinkSpec[] =>
  Array.from({ length: n - 1 }, (_, i) => [i, i + 1] as const);

/** Every pair among nodes `first … first + size − 1`. */
export function cliqueLinks(first: number, size: number): LinkSpec[] {
  const out: LinkSpec[] = [];
  for (let a = first; a < first + size; a++) {
    for (let b = a + 1; b < first + size; b++) out.push([a, b]);
  }
  return out;
}

/** A seeded generator of values in `[0, 1)` (a 32-bit LCG; tests must not use `Math.random`). */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** `links` links between uniformly drawn pairs of distinct nodes. */
export function randomLinks(nodes: number, links: number, seed: number): LinkSpec[] {
  const next = seeded(seed);
  return Array.from({ length: links }, () => {
    const s = Math.floor(next() * nodes);
    let t = Math.floor(next() * (nodes - 1));
    if (t >= s) t++;
    return [s, t] as const;
  });
}

/**
 * A planted-partition graph: `groups × size` nodes, node `i` in group `floor(i / size)`; a pair in
 * one group is linked with probability `pIn`, a pair across groups with `pOut`.
 */
export function plantedPartition(
  groups: number,
  size: number,
  pIn: number,
  pOut: number,
  seed: number,
): { nodes: number; links: LinkSpec[]; group: number[] } {
  const next = seeded(seed);
  const nodes = groups * size;
  const group = Array.from({ length: nodes }, (_, i) => Math.floor(i / size));
  const links: LinkSpec[] = [];
  for (let a = 0; a < nodes; a++) {
    for (let b = a + 1; b < nodes; b++) {
      if (next() < (group[a] === group[b] ? pIn : pOut)) links.push([a, b]);
    }
  }
  return { nodes, links, group };
}

type Positions = Pick<LayoutResult | LayoutSimulation, 'x' | 'y' | 'z'>;

/** Distance between nodes `a` and `b`. */
export function distance(p: Positions, a: number, b: number): number {
  return Math.hypot(p.x[a]! - p.x[b]!, p.y[a]! - p.y[b]!, (p.z?.[a] ?? 0) - (p.z?.[b] ?? 0));
}

/** Mean distance over the pairs `(a, b)`, `a < b`, that `keep` accepts. */
export function meanDistance(
  p: Positions,
  keep: (a: number, b: number) => boolean = () => true,
): number {
  let sum = 0;
  let count = 0;
  for (let a = 0; a < p.x.length; a++) {
    for (let b = a + 1; b < p.x.length; b++) {
      if (!keep(a, b)) continue;
      sum += distance(p, a, b);
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

/** Every coordinate of every node is a finite number. */
export function allFinite(p: Positions): boolean {
  return (
    p.x.every(Number.isFinite) &&
    p.y.every(Number.isFinite) &&
    (p.z?.every(Number.isFinite) ?? true)
  );
}

/** The largest distance of a node from (`cx`, `cy`, `cz`). */
export function radiusAround(p: Positions, cx = 0, cy = 0, cz = 0): number {
  let r = 0;
  for (let i = 0; i < p.x.length; i++) {
    r = Math.max(r, Math.hypot(p.x[i]! - cx, p.y[i]! - cy, (p.z?.[i] ?? 0) - cz));
  }
  return r;
}

/**
 * The deepest overlap between two nodes taken as circles of the given radii (0 or less: none
 * overlap).
 */
export function deepestOverlap(p: Positions, radius: (i: number) => number): number {
  let worst = -Infinity;
  for (let a = 0; a < p.x.length; a++) {
    for (let b = a + 1; b < p.x.length; b++) {
      worst = Math.max(worst, radius(a) + radius(b) - distance(p, a, b));
    }
  }
  return worst;
}
