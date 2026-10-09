import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { hubGraph } from '../_lib/graphs.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * ForceAtlas2 (backlog G2): `force.algorithm: 'forceatlas2'` is the second model of the force
 * arrangement. Nodes repel in proportion to their number of links, so the hubs of a graph that
 * has some push each other apart and take their followers with them, where springs of one length
 * would pack everything into a ball. Node sizes follow the degree (`node.sizeby`).
 */
export const meta: ExampleMeta = {
  title: 'Graph: ForceAtlas2',
  description: 'A graph with hubs laid out by ForceAtlas2, nodes sized by degree.',
  tags: ['graph', 'network', 'force', 'forceatlas2', 'layout', 'degree'],
  size: { width: 720, height: 520 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const net = hubGraph(90, 1, 4);
  const degree = net.label.map(() => 0);
  net.source.forEach((s, k) => {
    degree[s]!++;
    degree[net.target[k]!]!++;
  });
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        arrangement: 'force',
        force: { algorithm: 'forceatlas2' },
        node: {
          // Only the hubs are named.
          label: net.label.map((name, i) => (degree[i]! >= 5 ? name : '')),
          sizeby: 'degree',
          sizerange: [5, 26],
        },
        link: { source: net.source, target: net.target },
      },
    ],
    layout: {
      title: { text: 'Hubs and their followers' },
      margin: { l: 20, r: 20, t: 60, b: 20 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
