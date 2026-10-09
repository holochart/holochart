import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { communityGraph } from '../_lib/graphs.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The `arc` arrangement (backlog G8): an arc diagram. Every node sits on one line and every link
 * is an arc over it, so the order of the nodes is the whole picture. With groups, the nodes of a
 * group are next to each other (`arc.order: 'group'`, the default then): the links inside a group
 * are small arcs, and the few between groups are the large ones that stand out. Labels hang
 * under the line, turned upright so that neighbours do not collide.
 */
export const meta: ExampleMeta = {
  title: 'Graph: arc diagram',
  description: 'Nodes on a line ordered by group, links as arcs above it.',
  tags: ['graph', 'network', 'arc', 'arrangement', 'groups'],
  size: { width: 900, height: 460 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const net = communityGraph({ seed: 11, communities: 4, size: 9, inside: 0.3, between: 0.02 });
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        arrangement: 'arc',
        arc: { groupsep: 16, nodesep: 8 },
        node: { label: net.label, group: net.group, size: 9 },
        link: { source: net.source, target: net.target },
      },
    ],
    layout: {
      title: { text: 'Links inside and between four teams' },
      margin: { l: 20, r: 20, t: 60, b: 20 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
