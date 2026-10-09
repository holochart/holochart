import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Box nodes (backlog G1): `node.shape: 'box'` draws every node as a box as large as its label,
 * with the text inside, in a color that reads on the box. Arrowheads stop at the box's edge.
 * This is the node shape of pipelines and state diagrams; here the positions are given, and the
 * layered arrangement will place such boxes by itself.
 */
export const meta: ExampleMeta = {
  title: 'Graph: box nodes',
  description: 'Nodes as boxes around their labels, with arrows between them.',
  tags: ['graph', 'network', 'box', 'directed', 'diagram'],
  size: { width: 760, height: 380 },
  testTolerance: 0.004,
};

const STEPS: readonly (readonly [string, number, number, string])[] = [
  ['Checkout', 0, 1, 'Source'],
  ['Install', 1, 1, 'Source'],
  ['Lint', 2, 2, 'Checks'],
  ['Type check', 2, 1, 'Checks'],
  ['Unit tests', 2, 0, 'Checks'],
  ['Build', 3, 1, 'Ship'],
  ['Visual tests', 4, 1.6, 'Checks'],
  ['Publish', 5, 1, 'Ship'],
];

const NEEDS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [1, 3],
  [1, 4],
  [2, 5],
  [3, 5],
  [4, 5],
  [5, 6],
  [6, 7],
  [5, 7],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        node: {
          shape: 'box',
          label: STEPS.map((s) => s[0]),
          x: STEPS.map((s) => s[1]),
          y: STEPS.map((s) => s[2]),
          group: STEPS.map((s) => s[3]),
        },
        link: {
          source: NEEDS.map((n) => n[0]),
          target: NEEDS.map((n) => n[1]),
          arrow: { end: true },
          width: 1.5,
        },
      },
    ],
    layout: {
      title: { text: 'A build pipeline' },
      xaxis: { visible: false },
      yaxis: { visible: false },
      margin: { l: 50, r: 50, t: 60, b: 30 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
