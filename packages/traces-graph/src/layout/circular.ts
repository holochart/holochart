/**
 * The `circular` arrangement (ADR-029): nodes evenly spaced on a circle, from the top, clockwise.
 * With groups, the nodes of a group sit next to each other. The circle is as large as the nodes
 * need to sit `spacing` apart, so the arrangement keeps its proportions at any node size.
 */
import { maxExtent, nodeOrder, type NodeSort } from './order.ts';
import type { GraphLayout } from './types.ts';

/** Options of {@link circularLayout}. */
export interface CircularOptions {
  /** Circle radius in layout units. Default: what the nodes need at `spacing`. */
  readonly radius?: number;
  /** Gap between neighbouring nodes along the circle, in layout units. Default 16. */
  readonly spacing?: number;
  /** Angle of the first node in degrees, counter-clockwise from the x axis. Default 90 (top). */
  readonly startAngle?: number;
  /** Direction around the circle. Default `'clockwise'`. */
  readonly direction?: 'clockwise' | 'counterclockwise';
  /** Order of the nodes around the circle (see `nodeOrder`). */
  readonly sort?: NodeSort;
}

const number = (v: unknown, dflt: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : dflt;

/** Nodes on a circle around the origin. */
export const circularLayout: GraphLayout<CircularOptions | undefined> = (graph, options) => {
  const n = graph.nodes;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  // One node sits at the center; a circle needs two.
  if (n < 2) return { x, y };
  const spacing = Math.max(0, number(options?.spacing, 16));
  let around = 0;
  for (let i = 0; i < n; i++) {
    around += 2 * Math.max(graph.halfWidth[i] ?? 0, graph.halfHeight[i] ?? 0) + spacing;
  }
  // Two nodes are a diameter apart, not half a circumference.
  const needed = n === 2 ? (maxExtent(graph) + spacing) / 2 : around / (2 * Math.PI);
  const radius = Math.max(number(options?.radius, 0) || needed, 1);
  const start = (number(options?.startAngle, 90) * Math.PI) / 180;
  const sign = options?.direction === 'counterclockwise' ? 1 : -1;
  const order = nodeOrder(graph, options?.sort);
  for (let k = 0; k < n; k++) {
    const angle = start + (sign * 2 * Math.PI * k) / n;
    const i = order[k]!;
    x[i] = radius * Math.cos(angle);
    y[i] = radius * Math.sin(angle);
  }
  return { x, y };
};
