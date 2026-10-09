/**
 * Graphs for the layered layout's tests and benchmark: a {@link LayoutGraph} from a link list, and
 * seeded random graphs. Test support only; nothing here is exported from the package.
 */
import type { LayoutGraph } from '../types.ts';

export type LinkList = readonly (readonly [number, number])[];

export interface GraphExtras {
  /** Half extents: one number for all nodes, or one per node. Defaults 20 and 10. */
  readonly halfWidth?: number | readonly number[];
  readonly halfHeight?: number | readonly number[];
  readonly weight?: readonly number[];
  /** Group index per node, −1 for none. */
  readonly group?: readonly number[];
}

function filled(n: number, given: number | readonly number[] | undefined, fallback: number) {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = (typeof given === 'number' ? given : given?.[i]) ?? fallback;
  return out;
}

/** A layout graph of `n` nodes and the links given. */
export function graphOf(n: number, links: LinkList, extras: GraphExtras = {}): LayoutGraph {
  const group = extras.group ? Int32Array.from(extras.group) : undefined;
  return {
    nodes: n,
    source: Int32Array.from(links, (l) => l[0]),
    target: Int32Array.from(links, (l) => l[1]),
    weight: extras.weight
      ? Float64Array.from(extras.weight)
      : new Float64Array(links.length).fill(1),
    halfWidth: filled(n, extras.halfWidth, 20),
    halfHeight: filled(n, extras.halfHeight, 10),
    x: new Float64Array(n).fill(NaN),
    y: new Float64Array(n).fill(NaN),
    ...(group ? { group, groups: Math.max(-1, ...extras.group!) + 1 } : {}),
  };
}

/** A seeded generator of numbers in [0, 1) (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A random acyclic link list: `links` links `i → j` with `i < j ≤ i + window` (no window: any
 * later node). Parallel links can occur.
 */
export function randomDagLinks(
  nodes: number,
  links: number,
  seed: number,
  window = nodes,
): [number, number][] {
  const next = seeded(seed);
  const out: [number, number][] = [];
  if (nodes < 2) return out;
  for (let k = 0; k < links; k++) {
    const i = Math.floor(next() * (nodes - 1));
    const span = Math.min(window, nodes - 1 - i);
    out.push([i, i + 1 + Math.floor(next() * span)]);
  }
  return out;
}

/** A random link list between any two nodes: cycles, self-links and parallel links can occur. */
export function randomLinks(nodes: number, links: number, seed: number): [number, number][] {
  const next = seeded(seed);
  const out: [number, number][] = [];
  for (let k = 0; k < links; k++) {
    out.push([Math.floor(next() * nodes), Math.floor(next() * nodes)]);
  }
  return out;
}

/** Sources and targets of a link list as typed arrays. */
export function ends(links: LinkList): { source: Int32Array; target: Int32Array } {
  return {
    source: Int32Array.from(links, (l) => l[0]),
    target: Int32Array.from(links, (l) => l[1]),
  };
}
