import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { clusteredNetwork } from '../_lib/networks.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The `circular` arrangement (backlog G1): no positions are given, and the nodes are placed
 * evenly on a circle, the nodes of a group next to each other, so links inside a group are short
 * chords and links between groups cross the circle. `link.curve` bows every link the same way,
 * which separates the chords near the rim, and every label points away from the center. A
 * computed arrangement hides the axes and locks them to one scale, so the circle stays round at
 * any figure size.
 */
export const meta: ExampleMeta = {
  title: 'Graph: circular arrangement',
  description: 'Nodes on a circle, grouped, with curved links.',
  tags: ['graph', 'network', 'circular', 'arrangement', 'groups'],
  size: { width: 640, height: 520 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const net = clusteredNetwork({ seed: 2, clusters: 4, perCluster: 12, between: 10 });
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        arrangement: 'circular',
        node: { label: net.label, group: net.group, size: 11 },
        link: { source: net.source, target: net.target, curve: 0.12 },
      },
    ],
    layout: { title: { text: 'Links inside and between four groups' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
