import { createChart } from '@mk7s/holochart';
import { degrees, fromEdgeList, louvain } from '@mk7s/holochart/graph';
import { LES_MISERABLES } from '../_lib/les-miserables.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The characters of Les Misérables, linked when they appear together (backlog G10; Knuth's
 * Stanford GraphBase data). Nothing in the data says who belongs with whom: `louvain` finds the
 * communities from the links alone, each named here after its most-connected character, and the
 * force layout puts them apart. Nodes are sized by their number of links and links are as wide
 * as the number of co-appearances. Hover a character to see who they meet.
 */
export const meta: ExampleMeta = {
  title: 'Graph: Les Misérables, characters who appear together',
  description:
    'A weighted co-occurrence network laid out by forces, with communities found by Louvain.',
  tags: ['graph', 'network', 'force', 'communities', 'louvain', 'weighted'],
  size: { width: 900, height: 680 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const net = fromEdgeList(LES_MISERABLES, { directed: false });
  const community = louvain(net);
  const { degree } = degrees(net);

  // Name each community after its most-connected character.
  const hub = new Map<number, number>();
  community.forEach((c, i) => {
    const best = hub.get(c);
    if (best === undefined || (degree[i] ?? 0) > (degree[best] ?? 0)) hub.set(c, i);
  });
  const group = Array.from(community, (c) => `Around ${net.node.label[hub.get(c) ?? 0]}`);

  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        name: 'Les Misérables',
        arrangement: 'force',
        node: { label: net.node.label, group, sizeby: 'degree', sizerange: [6, 26] },
        link: {
          source: net.link.source,
          target: net.link.target,
          value: net.link.value,
          widthby: 'value',
          widthrange: [0.5, 5],
        },
      },
    ],
    layout: {
      title: { text: 'Les Misérables: who appears with whom' },
      margin: { l: 20, r: 20, t: 60, b: 20 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
