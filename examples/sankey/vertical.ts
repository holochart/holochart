import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A vertical sankey (plan E13.5a): `orientation: 'v'` turns the diagram so the flow runs top to
 * bottom — a household's monthly income split into its budget. Node labels are drawn over the
 * nodes, from their left edge, as in Plotly; `node.pad` and `node.thickness` set the spacing and
 * the node size along the flow.
 */
export const meta: ExampleMeta = {
  title: 'Sankey: vertical',
  description: 'A monthly household budget flowing top to bottom, from income to spending.',
  tags: ['sankey', 'hierarchical', 'flow', 'domain', 'orientation'],
  testTolerance: 0.004,
};

const LABELS = [
  'Salary', // 0
  'Freelance', // 1
  'Benefits', // 2
  'Budget', // 3
  'Housing', // 4
  'Living', // 5
  'Savings', // 6
  'Rent', // 7
  'Utilities', // 8
  'Groceries', // 9
  'Transport', // 10
  'Leisure', // 11
  'Pension', // 12
  'Emergency fund', // 13
];

/** `[source, target, €]`. */
const LINKS: [number, number, number][] = [
  [0, 3, 3200],
  [1, 3, 900],
  [2, 3, 300],
  [3, 4, 1650],
  [3, 5, 1850],
  [3, 6, 900],
  [4, 7, 1400],
  [4, 8, 250],
  [5, 9, 700],
  [5, 10, 450],
  [5, 11, 700],
  [6, 12, 500],
  [6, 13, 400],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'sankey',
        orientation: 'v',
        valueformat: ',.0f',
        valuesuffix: ' €',
        node: { label: LABELS, pad: 12, thickness: 16 },
        link: {
          source: LINKS.map((l) => l[0]),
          target: LINKS.map((l) => l[1]),
          value: LINKS.map((l) => l[2]),
        },
      },
    ],
    layout: { title: { text: 'Monthly budget, €' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
