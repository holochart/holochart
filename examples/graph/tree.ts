import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { SOURCE_TREE, treeRows } from '../_lib/trees.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The `tree` arrangement (backlog G4): a tidy tree. The data is the `ids` / `labels` / `parents`
 * of the hierarchical traces, so a treemap or a sunburst of the same rows is one attribute away.
 * Every parent sits in the middle of its children and subtrees are packed as close as their
 * outlines allow. The tree grows from the left by default, so that labels read along the levels:
 * beyond a leaf, and before a node that has children.
 */
export const meta: ExampleMeta = {
  title: 'Graph: tidy tree',
  description: 'A source tree from ids and parents, laid out as a tidy tree with curved links.',
  tags: ['graph', 'tree', 'tidy', 'hierarchy', 'layout'],
  size: { width: 760, height: 620 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const tree = treeRows(SOURCE_TREE);
  const depth = tree.ids.map((id) => id.split('/').length - 1);
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        arrangement: 'tree',
        ids: tree.ids,
        labels: tree.labels,
        parents: tree.parents,
        // Colored by the package: the second part of the path.
        node: { size: 9, group: tree.ids.map((id, i) => (depth[i]! > 0 ? id.split('/')[1]! : '')) },
      },
    ],
    layout: {
      title: { text: 'The source tree of a charting library' },
      showlegend: false,
      margin: { l: 20, r: 20, t: 60, b: 20 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
