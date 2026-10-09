import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The `dendrogram` arrangement (backlog G4): a tree drawn to show heights, as hierarchical
 * clustering draws its merges. The leaves stand on one line; every other node is at the height
 * `node.value` gives it, here the distance at which two clusters were joined, and the links are
 * the brackets of a clustering tree. The axis of the heights is a real axis, with ticks in the
 * data's units; the other one is hidden. A click on a merge folds its cluster away.
 */
export const meta: ExampleMeta = {
  title: 'Graph: dendrogram',
  description: 'A clustering tree with merge heights from node.value on a real axis.',
  tags: ['graph', 'tree', 'dendrogram', 'clustering', 'hierarchy'],
  size: { width: 760, height: 480 },
  testTolerance: 0.004,
};

/** A merge: its two children (leaf names or earlier merges, by index) and its height. */
type Merge = readonly [string | number, string | number, number];

/** Cheeses, joined by how alike they are (made-up distances). */
const MERGES: readonly Merge[] = [
  ['Brie', 'Camembert', 0.8],
  ['Cheddar', 'Red Leicester', 1.1],
  ['Gouda', 'Edam', 1.3],
  ['Roquefort', 'Stilton', 1.6],
  ['Parmesan', 'Pecorino', 1.9],
  ['Feta', 'Halloumi', 2.6],
  [1, 2, 2.9],
  [3, 'Gorgonzola', 2.4],
  [0, 'Taleggio', 3.1],
  [6, 4, 4.3],
  [8, 7, 5.2],
  [9, 5, 6.1],
  [11, 10, 8.4],
];

export function run(el: HTMLElement): ExampleHandle {
  const label: string[] = [];
  const value: (number | null)[] = [];
  const source: number[] = [];
  const target: number[] = [];
  const leaf = new Map<string, number>();
  const mergeNode: number[] = [];
  const nodeOf = (child: string | number): number => {
    if (typeof child === 'number') return mergeNode[child]!;
    if (!leaf.has(child)) {
      leaf.set(child, label.length);
      label.push(child);
      value.push(0);
    }
    return leaf.get(child)!;
  };
  MERGES.forEach(([a, b, height]) => {
    const children = [nodeOf(a), nodeOf(b)];
    const at = label.length;
    label.push('');
    value.push(height);
    mergeNode.push(at);
    for (const child of children) {
      source.push(at);
      target.push(child);
    }
  });
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        arrangement: 'dendrogram',
        node: {
          label,
          value,
          hovertemplate: '%{label}<br>joined at %{value}<extra></extra>',
        },
        link: { source, target, width: 1.5 },
      },
    ],
    layout: {
      title: { text: 'Which cheeses are alike' },
      yaxis: { title: { text: 'Distance' } },
      margin: { l: 60, r: 20, t: 60, b: 30 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
