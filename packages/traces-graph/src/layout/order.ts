/**
 * The order the simple layouts (`circular`, `grid`) place nodes in (ADR-029): by index, or with
 * the nodes of a group next to each other, or the most connected first. Pure and stable: ties
 * keep index order, so the same graph gives the same order everywhere.
 */
import type { LayoutGraph } from './types.ts';

/** How {@link nodeOrder} sorts. */
export type NodeSort = 'index' | 'group' | 'degree';

/** Links at each node (a self-link counts twice, as in graph theory). */
export function degrees(graph: LayoutGraph): Int32Array {
  const out = new Int32Array(graph.nodes);
  for (let k = 0; k < graph.source.length; k++) {
    out[graph.source[k]!]!++;
    out[graph.target[k]!]!++;
  }
  return out;
}

/**
 * Node indices in placement order. `'group'` (the default when the graph has groups) keeps each
 * group together, groups in order of their index and ungrouped nodes last; `'degree'` puts the
 * most connected nodes first.
 */
export function nodeOrder(graph: LayoutGraph, sort?: NodeSort): Int32Array {
  const n = graph.nodes;
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  const group = graph.group;
  const by = sort ?? (group && (graph.groups ?? 0) > 0 ? 'group' : 'index');
  if (by === 'group' && group) {
    const key = (i: number): number => (group[i]! < 0 ? Infinity : group[i]!);
    order.sort((a, b) => key(a) - key(b) || a - b);
  } else if (by === 'degree') {
    const degree = degrees(graph);
    order.sort((a, b) => degree[b]! - degree[a]! || a - b);
  }
  return order;
}

/** The largest node extent (width or height) in layout units; 0 for an empty graph. */
export function maxExtent(graph: LayoutGraph): number {
  let max = 0;
  for (let i = 0; i < graph.nodes; i++) {
    const e = 2 * Math.max(graph.halfWidth[i] ?? 0, graph.halfHeight[i] ?? 0);
    if (e > max) max = e;
  }
  return max;
}
