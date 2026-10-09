import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { communityGraph } from '../_lib/graphs.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The `force` arrangement (backlog G2): no positions are given. Links pull their nodes together
 * and every two nodes push each other apart, so the nodes that share many links end up close:
 * the four teams of this graph, which the data only says by color, come apart by themselves.
 * `force` is the default arrangement of a graph without positions. The layout is deterministic:
 * the same figure gives the same picture on every machine.
 */
export const meta: ExampleMeta = {
  title: 'Graph: force-directed layout',
  description: 'Four communities found by a force-directed layout, colored by group.',
  tags: ['graph', 'network', 'force', 'layout', 'groups'],
  size: { width: 720, height: 520 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const net = communityGraph({ seed: 5, communities: 4, size: 14, inside: 0.3, between: 0.012 });
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        arrangement: 'force',
        node: { label: net.label, group: net.group, size: 11 },
        link: { source: net.source, target: net.target },
      },
    ],
    layout: {
      title: { text: 'Four teams, placed by their links' },
      margin: { l: 20, r: 20, t: 60, b: 20 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
