import { createChart } from '@mk7s/holochart';
import { fromEdgeList, louvain } from '@mk7s/holochart/graph';
import hx from '@mk7s/holochart-express';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Express adjacency matrix (backlog G8, G9): `hx.adjacencyMatrix` draws a network as a heatmap, a
 * row and a column per node, which still reads where a node-link drawing is a hairball. The edge
 * table lists the pairs in no order; `louvain` (a helper of the graph package) finds the
 * communities, and `order: 'community'` sorts rows and columns by them, so the three circles of
 * friends show as blocks on the diagonal and the few links between them stand apart.
 *
 * The matrix is a `heatmap` trace, which the full bundle has; the graph package is imported for
 * its helpers only.
 */
export const meta: ExampleMeta = {
  title: 'Express: adjacency matrix ordered by community',
  description:
    'Messages between thirty people as a matrix, rows and columns ordered by detected community.',
  tags: ['express', 'heatmap', 'network', 'matrix', 'edges', 'community'],
  size: { width: 640, height: 600 },
  testTolerance: 0.004,
};

const CIRCLES = 3;
const PEOPLE = 30;

/** Messages between people: many within a circle of friends, few across. In shuffled order. */
function messages(): { from: string; to: string; messages: number }[] {
  const random = rng(11);
  const rows: { from: string; to: string; messages: number }[] = [];
  for (let a = 0; a < PEOPLE; a++) {
    for (let b = a + 1; b < PEOPLE; b++) {
      const close = a % CIRCLES === b % CIRCLES;
      if (random() > (close ? 0.6 : 0.03)) continue;
      const count = 1 + Math.floor(random() * (close ? 12 : 3));
      rows.push({ from: `P${a + 1}`, to: `P${b + 1}`, messages: count });
    }
  }
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rows[i], rows[j]] = [rows[j]!, rows[i]!];
  }
  return rows;
}

export function run(el: HTMLElement): ExampleHandle {
  const rows = messages();
  // Node-link data, which the measures and Express both read: the nodes are in the same order.
  const network = fromEdgeList(rows, {
    source: 'from',
    target: 'to',
    value: 'messages',
    directed: false,
  });
  const figure = hx.adjacencyMatrix(network, {
    color: louvain(network),
    order: 'community',
    labels: { value: 'Messages' },
    title: 'Who writes to whom',
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
