import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { clusteredNetwork } from '../_lib/networks.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Groups (backlog G1): `node.group` names a group per node. Every group takes a color of the
 * colorway and gets a legend item; clicking an item hides the group's nodes and their links
 * (`layout.hiddenlabels`, as for pie slices), and a double click isolates it. Labels are culled
 * where they would overlap: the nodes with the most links keep theirs, and zooming in shows more.
 */
export const meta: ExampleMeta = {
  title: 'Graph: groups with a legend',
  description: 'Nodes colored by group from the colorway, one legend item per group.',
  tags: ['graph', 'network', 'groups', 'legend', 'labels'],
  size: { width: 760, height: 480 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const net = clusteredNetwork({ seed: 3, clusters: 4, perCluster: 28, between: 9 });
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        node: { label: net.label, x: net.x, y: net.y, group: net.group, size: 9 },
        link: { source: net.source, target: net.target },
      },
    ],
    layout: {
      title: { text: 'Four teams and the links between them' },
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
