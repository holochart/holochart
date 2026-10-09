import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { clusteredNetwork } from '../_lib/networks.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A force-directed network in space (backlog G6): six groups of fifty nodes, placed by the 3D
 * force layout (`arrangement: 'force'` is the default when the nodes have no positions). Nodes
 * are lit spheres sized by their links; `force.groupstrength` keeps each group together. The
 * layout is deterministic, so this picture is the same everywhere. Drag to orbit, scroll to move
 * closer; hovering a node (found by GPU picking) names it, and the legend hides a group.
 */
export const meta: ExampleMeta = {
  title: 'Graph 3D: force layout with groups',
  description:
    'Three hundred nodes in six groups, placed by the 3D force layout; spheres sized by degree, one legend item per group.',
  tags: ['graph3d', 'graph', 'network', '3d', 'force', 'groups', 'legend'],
  size: { width: 760, height: 520 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const net = clusteredNetwork({ seed: 11, clusters: 6, perCluster: 50, between: 36 });
  const chart = createChart(el, {
    data: [
      {
        type: 'graph3d',
        node: {
          label: net.label,
          group: net.group,
          sizeby: 'degree',
          sizerange: [7, 22],
        },
        link: { source: net.source, target: net.target },
        force: { groupstrength: 0.12 },
      },
    ],
    layout: {
      title: { text: 'Six teams, placed by the 3D force layout' },
      margin: { l: 0, r: 0, t: 50, b: 0 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
