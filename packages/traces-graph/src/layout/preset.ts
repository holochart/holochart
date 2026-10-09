/**
 * The `preset` arrangement (ADR-029): every node stays where the figure put it (`node.x`,
 * `node.y`). A node without a position is left out (`hidden`), and so are its links.
 */
import type { GraphLayout } from './types.ts';

/** Positions as given. */
export const presetLayout: GraphLayout = (graph) => {
  const n = graph.nodes;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  let hidden: Uint8Array | undefined;
  for (let i = 0; i < n; i++) {
    const xi = graph.x[i]!;
    const yi = graph.y[i]!;
    if (Number.isFinite(xi) && Number.isFinite(yi)) {
      x[i] = xi;
      y[i] = yi;
    } else {
      hidden ??= new Uint8Array(n);
      hidden[i] = 1;
    }
  }
  return hidden ? { x, y, hidden } : { x, y };
};
