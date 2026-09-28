import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Circular links (plan E13.5a): a material loop with cycles. Links that close a cycle — recycled
 * material going back into production, rework, a product that is refurbished and used again — are
 * drawn as loops around the diagram (below, or above when a node's loops already go there), their
 * lanes stacked so they don't overlap. The rest is laid out as usual, and room is reserved for the
 * loops.
 */
export const meta: ExampleMeta = {
  title: 'Sankey: circular links',
  description: 'A circular economy with recycling and rework drawn as loops around the diagram.',
  tags: ['sankey', 'hierarchical', 'flow', 'domain', 'circular'],
  testTolerance: 0.004,
};

const LABELS = [
  'Raw material', // 0
  'Production', // 1
  'Products', // 2
  'Use', // 3
  'Waste', // 4
  'Recycling', // 5
  'Landfill', // 6
  'Rework', // 7
];

/** `[source, target, kt]`. */
const LINKS: [number, number, number][] = [
  [0, 1, 100],
  [1, 2, 88],
  [1, 7, 12],
  [7, 1, 10],
  [7, 4, 2],
  [2, 3, 88],
  [3, 3, 14],
  [3, 4, 74],
  [4, 5, 46],
  [4, 6, 30],
  [5, 1, 40],
  [5, 6, 6],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'sankey',
        valuesuffix: ' kt',
        node: { label: LABELS, pad: 18 },
        link: {
          source: LINKS.map((l) => l[0]),
          target: LINKS.map((l) => l[1]),
          value: LINKS.map((l) => l[2]),
        },
      },
    ],
    layout: { title: { text: 'Material flows with recycling, kt per year' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
