/**
 * Small graphs for the tree layout tests: a tree from a parent list or a graph from a link list,
 * with the typed arrays a {@link LayoutGraph} wants filled in. Test support only; nothing here is
 * exported from the package.
 */
import fc from 'fast-check';
import type { LayoutGraph } from '../types.ts';

export interface GraphExtras {
  /** Half extents: one number for all nodes, or one per node. Default 0 (points). */
  readonly halfWidth?: number | readonly number[];
  readonly halfHeight?: number | readonly number[];
  readonly value?: readonly number[];
  readonly links?: readonly (readonly [number, number])[];
}

function filled(n: number, given: number | readonly number[] | undefined): Float64Array {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = (typeof given === 'number' ? given : given?.[i]) ?? 0;
  return out;
}

function graphOf(n: number, extras: GraphExtras): Omit<LayoutGraph, 'parent'> {
  const links = extras.links ?? [];
  return {
    nodes: n,
    source: Int32Array.from(links, (l) => l[0]),
    target: Int32Array.from(links, (l) => l[1]),
    weight: new Float64Array(links.length).fill(1),
    halfWidth: filled(n, extras.halfWidth),
    halfHeight: filled(n, extras.halfHeight),
    x: new Float64Array(n).fill(NaN),
    y: new Float64Array(n).fill(NaN),
    ...(extras.value ? { value: Float64Array.from(extras.value) } : {}),
  };
}

/** A graph with tree input: `parent[i]` is node `i`'s parent, `-1` for a root. */
export function treeGraph(parent: readonly number[], extras: GraphExtras = {}): LayoutGraph {
  return { ...graphOf(parent.length, extras), parent: Int32Array.from(parent) };
}

/** A graph of `nodes` nodes given by its links, without tree input. */
export function linkGraph(
  nodes: number,
  links: readonly (readonly [number, number])[],
  extras: GraphExtras = {},
): LayoutGraph {
  return graphOf(nodes, { ...extras, links });
}

/**
 * The mirror image of a tree whose parents all come before their children: node `i` becomes node
 * `n − 1 − i`, which reverses every list of siblings.
 */
export function mirrorParents(parent: readonly number[]): number[] {
  const n = parent.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[n - 1 - i] = parent[i]! < 0 ? -1 : n - 1 - parent[i]!;
  return out;
}

/** A random tree as a parent list, parents before children: node 0 is the root. */
export const arbitraryTree = (maxNodes = 40): fc.Arbitrary<number[]> =>
  fc
    .array(fc.nat(), { minLength: 1, maxLength: maxNodes })
    .map((picks) => picks.map((pick, i) => (i === 0 ? -1 : pick % i)));

/** A random forest: as {@link arbitraryTree}, with about one node in six a root. */
export const arbitraryForest = (maxNodes = 40): fc.Arbitrary<number[]> =>
  fc
    .array(fc.tuple(fc.nat(), fc.nat(5)), { minLength: 1, maxLength: maxNodes })
    .map((picks) => picks.map(([pick, die], i) => (i === 0 || die === 0 ? -1 : pick % i)));

/** A deterministic tree of `n` nodes with a mix of wide and deep parts (a multiplicative hash). */
export function scrambledTree(n: number): number[] {
  const parent = new Array<number>(n);
  parent[0] = -1;
  for (let i = 1; i < n; i++) {
    const h = Math.imul(i, 0x9e3779b1) >>> 0;
    // Mostly a recent node (depth), sometimes any earlier one (breadth).
    parent[i] = h % 3 === 0 ? h % i : i - 1 - (h % Math.min(i, 8));
  }
  return parent;
}
