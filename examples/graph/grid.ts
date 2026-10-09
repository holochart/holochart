import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The `grid` arrangement (backlog G1): nodes in rows, left to right and top to bottom. Here the
 * graph is a tree given the way the hierarchical traces take one, as `labels` and `parents`:
 * every node with a parent gets a link from its parent. The same two arrays feed a treemap or a
 * sunburst, and the tree arrangements when they are there.
 */
export const meta: ExampleMeta = {
  title: 'Graph: grid arrangement of a tree given as labels and parents',
  description: 'Nodes in rows; the links come from a `parents` array.',
  tags: ['graph', 'network', 'grid', 'arrangement', 'tree'],
  testTolerance: 0.004,
};

const TREE: readonly (readonly [string, string])[] = [
  ['Company', ''],
  ['Product', 'Company'],
  ['Sales', 'Company'],
  ['Operations', 'Company'],
  ['Design', 'Product'],
  ['Engineering', 'Product'],
  ['Research', 'Product'],
  ['Europe', 'Sales'],
  ['Americas', 'Sales'],
  ['Asia', 'Sales'],
  ['Finance', 'Operations'],
  ['People', 'Operations'],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        arrangement: 'grid',
        labels: TREE.map((t) => t[0]),
        parents: TREE.map((t) => t[1]),
        node: { size: 16, color: '#59a14f', textposition: 'bottom center' },
        link: { arrow: { end: true }, curve: 0.15 },
      },
    ],
    layout: { title: { text: 'An org chart on a grid' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
