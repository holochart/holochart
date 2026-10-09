import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A basic `graph` trace (backlog G1): nodes at positions the figure gives and the links between
 * them. `link.source` and `link.target` are node indices, as in a sankey trace. Giving every node
 * an `x` and a `y` selects `arrangement: 'preset'`: the positions are data on the trace's axes,
 * so the chart zooms, pans and selects like a scatter chart. Here the axes are hidden and locked
 * to one scale, which is what a computed arrangement does by itself.
 *
 * The graph is not part of the full bundle: `import '@mk7s/holochart/graph'` registers it.
 */
export const meta: ExampleMeta = {
  title: 'Graph: basic',
  description: 'A small network: nodes at given positions, links between them, labels.',
  tags: ['graph', 'network', 'preset', 'basic'],
  testTolerance: 0.004,
};

const NODES: readonly (readonly [string, number, number])[] = [
  ['Ada', 0, 2],
  ['Ben', 2, 3.2],
  ['Cleo', 2.2, 1],
  ['Dev', 4.2, 2.2],
  ['Eli', 4, 4.4],
  ['Fay', 6.2, 3.6],
  ['Gus', 6.4, 1.2],
  ['Hana', 8.2, 2.4],
  ['Ivo', 4.4, 0],
  ['Jun', 0.6, 4.2],
];

const LINKS: readonly (readonly [number, number])[] = [
  [0, 1],
  [0, 2],
  [1, 2],
  [1, 3],
  [1, 4],
  [2, 3],
  [3, 5],
  [3, 6],
  [4, 5],
  [5, 7],
  [6, 7],
  [2, 8],
  [6, 8],
  [0, 9],
  [1, 9],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        node: {
          label: NODES.map((n) => n[0]),
          x: NODES.map((n) => n[1]),
          y: NODES.map((n) => n[2]),
          size: 14,
        },
        link: { source: LINKS.map((l) => l[0]), target: LINKS.map((l) => l[1]), width: 1.5 },
      },
    ],
    layout: {
      title: { text: 'Who works with whom' },
      xaxis: { visible: false },
      yaxis: { visible: false, scaleanchor: 'x' },
      margin: { l: 30, r: 30, t: 60, b: 30 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
