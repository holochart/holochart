import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { clusteredNetwork } from '../_lib/networks.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A graph of 2,000 nodes and about 3,000 links at given positions (backlog G1). All the nodes
 * are one instanced draw call and all the links another, so the count hardly matters: zooming and
 * panning set a transform and upload nothing. Of 2,000 labels the view shows the ones that fit,
 * most connected nodes first; zoom into a cluster to read the rest.
 */
export const meta: ExampleMeta = {
  title: 'Graph: 2,000 nodes',
  description: 'A large network at given positions: two draw calls, labels culled by degree.',
  tags: ['graph', 'network', 'large', 'performance', 'labels'],
  size: { width: 800, height: 600 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const net = clusteredNetwork({ seed: 9, clusters: 10, perCluster: 200, between: 60 });
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        node: {
          label: net.label,
          x: net.x,
          y: net.y,
          group: net.group,
          sizeby: 'degree',
          sizerange: [3, 16],
          line: { width: 0.5 },
        },
        link: { source: net.source, target: net.target, width: 0.75 },
        showlegend: false,
      },
    ],
    layout: {
      title: { text: '2,000 nodes in ten clusters' },
      xaxis: { visible: false },
      yaxis: { visible: false, scaleanchor: 'x' },
      margin: { l: 20, r: 20, t: 60, b: 20 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
