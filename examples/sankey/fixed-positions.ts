import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Fixed node positions (plan E13.5a): `node.x` and `node.y` place node centers as fractions of
 * the domain (x left to right, y top to bottom), overriding the layout — here a supply chain
 * drawn with its warehouses stacked by region. With positions given, `arrangement` defaults to
 * `'freeform'`, so nodes can then be dragged anywhere. As in Plotly, a position of exactly 0
 * counts as unset (use a small value such as 0.001 for an edge).
 */
export const meta: ExampleMeta = {
  title: 'Sankey: fixed node positions',
  description: 'A supply chain with node positions set by node.x and node.y.',
  tags: ['sankey', 'hierarchical', 'flow', 'domain', 'layout'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'sankey',
        valuesuffix: ' t',
        node: {
          label: ['Plant A', 'Plant B', 'Hub North', 'Hub South', 'Store 1', 'Store 2', 'Store 3'],
          x: [0.05, 0.05, 0.45, 0.55, 0.95, 0.95, 0.95],
          y: [0.3, 0.75, 0.2, 0.7, 0.15, 0.5, 0.85],
          pad: 16,
        },
        link: {
          source: [0, 0, 1, 1, 2, 2, 3, 3, 3],
          target: [2, 3, 2, 3, 4, 5, 5, 6, 4],
          value: [30, 12, 8, 26, 22, 16, 14, 20, 4],
        },
      },
    ],
    layout: { title: { text: 'Deliveries per week, tonnes' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
