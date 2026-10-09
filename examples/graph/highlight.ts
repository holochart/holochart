import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { communityGraph } from '../_lib/graphs.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Hover highlighting (backlog G5): the pointer over a node highlights the node, the links that
 * lead from it and the nodes they reach, and dims everything else; over a link, the link and its
 * two ends. `highlight.hops: 2` reaches the neighbours of the neighbours, which here crosses from
 * one team into the next. Only colors and opacities change, so it costs the same on a graph of
 * thousands of nodes. The labels of the highlighted nodes show even where there was no room for
 * them.
 *
 * The picture starts with one node highlighted through `highlight.nodes`, which does what a hover
 * does without a pointer (an app drives it from a search box or another chart). Move the pointer
 * over any other node to see its neighbourhood instead.
 */
export const meta: ExampleMeta = {
  title: 'Graph: neighbourhood highlight',
  description:
    'Hovering a node highlights what is within two links of it and dims the rest of the graph.',
  tags: ['graph', 'network', 'highlight', 'hover', 'neighbors', 'interaction'],
  size: { width: 760, height: 520 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const net = communityGraph({ seed: 12, communities: 5, size: 12, inside: 0.32, between: 0.012 });
  const team = (i: number): number => Math.floor(i / 12);
  // The node with the most links into other teams: two hops from it reach well beyond its own.
  const bridges = net.label.map(() => 0);
  net.source.forEach((s, k) => {
    const t = net.target[k]!;
    if (team(s) === team(t)) return;
    bridges[s] = bridges[s]! + 1;
    bridges[t] = bridges[t]! + 1;
  });
  const start = bridges.indexOf(Math.max(...bridges));
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        arrangement: 'force',
        force: { groupstrength: 0.1, linkdistance: 36 },
        node: {
          label: net.label,
          group: net.group,
          sizeby: 'degree',
          sizerange: [8, 20],
          hovertemplate: '%{label}<br>%{neighbors} neighbours<extra>%{group}</extra>',
        },
        link: { source: net.source, target: net.target },
        highlight: { hops: 2, nodes: [start] },
      },
    ],
    layout: {
      title: { text: `Within two links of ${net.label[start]}` },
      margin: { l: 20, r: 20, t: 60, b: 20 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
