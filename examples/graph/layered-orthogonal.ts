import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Left to right, with right angles (backlog G3): `layered.rankdir: 'LR'` turns the layers into
 * columns and `layered.routing: 'orthogonal'` draws every link as horizontal and vertical
 * segments, the look of a circuit or a build graph. `'polyline'` and the default `'spline'` route
 * through the same points.
 */
export const meta: ExampleMeta = {
  title: 'Graph: layered, left to right, orthogonal links',
  description: 'A build graph in columns with links drawn as right-angled routes.',
  tags: ['graph', 'layered', 'dag', 'orthogonal', 'routing', 'diagram'],
  size: { width: 820, height: 420 },
  testTolerance: 0.004,
};

const TASKS = [
  'checkout',
  'install',
  'codegen',
  'lint',
  'typecheck',
  'unit tests',
  'build',
  'bundle size',
  'visual tests',
  'docs',
  'publish',
];

const NEEDS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [1, 3],
  [2, 4],
  [2, 5],
  [4, 6],
  [5, 6],
  [3, 6],
  [6, 7],
  [6, 8],
  [6, 9],
  [7, 10],
  [8, 10],
  [9, 10],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        arrangement: 'layered',
        layered: { rankdir: 'LR', routing: 'orthogonal', ranksep: 44, nodesep: 18 },
        node: { label: TASKS, color: '#3b6fb6' },
        link: { source: NEEDS.map((n) => n[0]), target: NEEDS.map((n) => n[1]), width: 1.5 },
      },
    ],
    layout: {
      title: { text: 'What runs before a release' },
      margin: { l: 20, r: 20, t: 60, b: 20 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
