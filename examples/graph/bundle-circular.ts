import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { communityGraph } from '../_lib/graphs.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Hierarchical link bundling (backlog G7): `link.bundle.method: 'hierarchical'`. The nodes of
 * this graph have groups, and the `circular` arrangement puts the nodes of a group next to each
 * other on the circle. Each link is drawn along the path between its two ends in that hierarchy,
 * from its node to the middle of its group, across to the other group, and out to the other
 * node, so the links between the same two groups share their middle and the figure shows which
 * groups are tied to which. The links inside a group bend a little towards its middle. Without
 * bundling the same links are 400 chords across the circle.
 *
 * The nodes stay where the arrangement put them, and hover finds a link on its curve.
 */
export const meta: ExampleMeta = {
  title: 'Graph: hierarchical link bundling',
  description: 'Links between groups drawn together as bundles, on a circular arrangement.',
  tags: ['graph', 'network', 'circular', 'bundle', 'groups', 'large'],
  size: { width: 680, height: 620 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const net = communityGraph({ seed: 3, communities: 8, size: 20, inside: 0.12, between: 0.018 });
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        arrangement: 'circular',
        node: { label: net.label, group: net.group, size: 7, line: { width: 0.5 } },
        link: {
          source: net.source,
          target: net.target,
          width: 0.75,
          bundle: { method: 'hierarchical', strength: 0.9 },
        },
      },
    ],
    layout: {
      title: { text: 'Eight teams and the links between them' },
      margin: { l: 30, r: 30, t: 60, b: 30 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
