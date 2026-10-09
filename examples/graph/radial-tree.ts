import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { treeRows, VERTEBRATES } from '../_lib/trees.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The `radial` arrangement (backlog G4): the tidy tree bent round, the root in the middle and
 * every level on a ring. It fits a wide tree into a square, and gives the outer ring, where most
 * of the nodes are, the most room. Labels run along the radius, outwards from the leaves and
 * inwards from the nodes that have children, and are turned on the left half so that none is
 * upside down.
 */
export const meta: ExampleMeta = {
  title: 'Graph: radial tree',
  description: 'Eighty animals on rings around their common root, labels along the radii.',
  tags: ['graph', 'tree', 'radial', 'hierarchy', 'layout'],
  size: { width: 760, height: 760 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const tree = treeRows(VERTEBRATES);
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        arrangement: 'radial',
        ids: tree.ids,
        labels: tree.labels,
        parents: tree.parents,
        node: {
          size: 7,
          // Colored by class: the second part of the path.
          group: tree.ids.map((id) => id.split('/')[1] ?? ''),
          textfont: { size: 11 },
        },
      },
    ],
    layout: {
      title: { text: 'Animals with a backbone' },
      showlegend: false,
      margin: { l: 20, r: 20, t: 50, b: 20 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
