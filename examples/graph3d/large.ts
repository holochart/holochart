import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { clusteredNetwork } from '../_lib/networks.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A larger network (backlog G6): 2,400 nodes in twelve groups and about 2,600 links, placed by
 * the 3D force layout (Barnes–Hut on an octree) in calc. The nodes are one draw call of sphere
 * impostors and the links one draw call of lines, whatever their number, so the scene orbits as
 * a small one does. Labels are left to hover.
 */
export const meta: ExampleMeta = {
  title: 'Graph 3D: 2,400 nodes',
  description:
    'A network of 2,400 nodes and 2,600 links in twelve groups, laid out in 3D in calc and drawn in two draw calls.',
  tags: ['graph3d', 'graph', 'network', '3d', 'force', 'large'],
  size: { width: 760, height: 560 },
  testTolerance: 0.006,
};

export function run(el: HTMLElement): ExampleHandle {
  const net = clusteredNetwork({ seed: 4, clusters: 12, perCluster: 200, between: 220 });
  const chart = createChart(el, {
    data: [
      {
        type: 'graph3d',
        node: {
          label: net.label,
          group: net.group,
          sizeby: 'degree',
          sizerange: [3, 10],
          textposition: 'none',
        },
        link: { source: net.source, target: net.target, opacity: 0.6 },
        force: { groupstrength: 0.1 },
      },
    ],
    layout: {
      title: { text: '2,400 nodes, twelve groups' },
      margin: { l: 0, r: 0, t: 50, b: 0 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
