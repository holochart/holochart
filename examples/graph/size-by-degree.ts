import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { clusteredNetwork } from '../_lib/networks.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Size by degree (backlog G1): `node.sizeby: 'degree'` sizes every node by the number of links
 * at it, between the two diameters of `node.sizerange` (areas are proportional to the count).
 * `'indegree'` and `'outdegree'` count the links that end or start at the node. The labels that
 * show are those of the largest nodes: label culling ranks nodes by degree too. Hover a node for
 * its link count.
 */
export const meta: ExampleMeta = {
  title: 'Graph: node size by degree',
  description: 'Nodes sized by their number of links; the most connected nodes keep their labels.',
  tags: ['graph', 'network', 'degree', 'size', 'labels'],
  size: { width: 720, height: 480 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const net = clusteredNetwork({ seed: 5, clusters: 3, perCluster: 45, between: 6, hubs: 0.45 });
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
          sizerange: [5, 32],
        },
        link: { source: net.source, target: net.target },
        showlegend: false,
      },
    ],
    layout: {
      title: { text: 'Hubs stand out' },
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
