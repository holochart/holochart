import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The `layered` arrangement (backlog G3): a directed graph drawn in layers, every link pointing
 * down. Nodes are boxes around their labels and links are routed around the boxes, with their
 * arrowheads on the boxes' edges: both are the defaults of this arrangement.
 * `layered.clusters` keeps the nodes of a group together and frames each group, with its name.
 */
export const meta: ExampleMeta = {
  title: 'Graph: layered pipeline with clusters',
  description: 'A data pipeline as a layered diagram: box nodes, routed links, framed groups.',
  tags: ['graph', 'layered', 'dag', 'clusters', 'pipeline', 'diagram'],
  size: { width: 760, height: 600 },
  testTolerance: 0.004,
};

/** Step, and its stage. */
const STEPS: readonly (readonly [string, string])[] = [
  ['Orders API', 'Sources'],
  ['Clickstream', 'Sources'],
  ['CRM export', 'Sources'],
  ['Validate', 'Ingest'],
  ['Deduplicate', 'Ingest'],
  ['Sessionize', 'Ingest'],
  ['Join customers', 'Transform'],
  ['Aggregate daily', 'Transform'],
  ['Score churn', 'Transform'],
  ['Warehouse', 'Serve'],
  ['Dashboards', 'Serve'],
  ['Alerts', 'Serve'],
];

const FLOWS: readonly (readonly [number, number])[] = [
  [0, 3],
  [1, 3],
  [1, 5],
  [2, 4],
  [3, 4],
  [4, 6],
  [5, 6],
  [5, 7],
  [6, 7],
  [6, 8],
  [7, 9],
  [8, 9],
  [9, 10],
  [8, 11],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        arrangement: 'layered',
        layered: { clusters: true, ranksep: 36, nodesep: 24 },
        node: { label: STEPS.map((s) => s[0]), group: STEPS.map((s) => s[1]) },
        link: { source: FLOWS.map((f) => f[0]), target: FLOWS.map((f) => f[1]), width: 1.5 },
      },
    ],
    layout: {
      title: { text: 'From three sources to dashboards' },
      showlegend: false,
      margin: { l: 20, r: 20, t: 60, b: 20 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
