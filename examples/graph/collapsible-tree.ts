import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { treeRows, VERTEBRATES } from '../_lib/trees.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Folding a tree (backlog G4): `tree.collapsed` lists the nodes whose subtrees are folded away.
 * A collapsed node has a ring around it, and its descendants take no room, so a large tree can
 * start as an outline. Click a node that has children to unfold it, or to fold it again: the
 * chart updates `tree.collapsed` itself (and emits `restyle`), and the tree glides to its new
 * shape. Here every order of animals starts folded; the ids are those of the rows.
 */
export const meta: ExampleMeta = {
  title: 'Graph: collapsible tree',
  description: 'A tree that starts folded; clicking a node unfolds or folds its subtree.',
  tags: ['graph', 'tree', 'collapse', 'interaction', 'hierarchy'],
  size: { width: 760, height: 560 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const tree = treeRows(VERTEBRATES);
  // Fold every node two levels below the root that has children, and all of the mammals but one.
  const hasChildren = new Set(tree.parents);
  const collapsed = tree.ids.filter(
    (id) => hasChildren.has(id) && id.split('/').length === 3 && !id.includes('Placentals'),
  );
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        arrangement: 'tree',
        ids: tree.ids,
        labels: tree.labels,
        parents: tree.parents,
        tree: { collapsed },
        node: { size: 10, group: tree.ids.map((id) => id.split('/')[1] ?? '') },
      },
    ],
    layout: {
      title: { text: 'Click a ringed node to unfold it' },
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
