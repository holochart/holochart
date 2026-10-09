/**
 * The `grid` arrangement (ADR-029): nodes in rows, left to right and top to bottom, in a grid
 * as close to square as the count allows. With groups, the nodes of a group follow each other.
 */
import { maxExtent, nodeOrder, type NodeSort } from './order.ts';
import type { GraphLayout } from './types.ts';

/** Options of {@link gridLayout}. */
export interface GridOptions {
  /** Nodes per row. Default: the square root of the node count, rounded up. */
  readonly columns?: number;
  /** Gap between neighbouring nodes, in layout units. Default 24. */
  readonly spacing?: number;
  /** Order of the nodes, row by row (see `nodeOrder`). */
  readonly sort?: NodeSort;
}

/** Nodes on a grid centered on the origin; the first row is on top (the largest y). */
export const gridLayout: GraphLayout<GridOptions | undefined> = (graph, options) => {
  const n = graph.nodes;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  if (n === 0) return { x, y };
  const asked = options?.columns;
  const columns =
    typeof asked === 'number' && asked >= 1
      ? Math.min(n, Math.floor(asked))
      : Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / columns);
  const gap = options?.spacing;
  const step = maxExtent(graph) + (typeof gap === 'number' && gap >= 0 ? gap : 24);
  const order = nodeOrder(graph, options?.sort);
  for (let k = 0; k < n; k++) {
    const i = order[k]!;
    x[i] = ((k % columns) - (columns - 1) / 2) * step;
    y[i] = ((rows - 1) / 2 - Math.floor(k / columns)) * step;
  }
  return { x, y };
};
