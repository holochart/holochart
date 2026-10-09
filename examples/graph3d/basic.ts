import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A basic `graph3d` trace (backlog G6): fourteen people and who reviews whose work (invented
 * numbers). Without positions the nodes are placed by the 3D force layout. `link.value` is the
 * number of reviews: it pulls two people together in the layout, and with
 * `link.widthby: 'value'` it sets the width of their link. The widest link is 6 px, so the links
 * are drawn as tubes (`link.render: 'auto'` draws tubes from 3 px). Nodes are spheres sized by
 * their number of links, each with its label where there is room for it.
 *
 * The 3D graph is not part of the full bundle: `import '@mk7s/holochart/graph'` registers it.
 */
export const meta: ExampleMeta = {
  title: 'Graph 3D: basic',
  description: 'Fourteen people linked by their reviews: labeled spheres, link widths by value.',
  tags: ['graph3d', 'graph', 'network', '3d', 'force', 'labels', 'basic'],
  size: { width: 720, height: 520 },
  testTolerance: 0.004,
};

const PEOPLE = [
  'Ada',
  'Bo',
  'Cy',
  'Dee',
  'Eli',
  'Fay',
  'Gus',
  'Hal',
  'Ivy',
  'Jo',
  'Kit',
  'Lu',
  'Mo',
  'Nell',
];

/** `[reviewer, author, reviews]`, as indices into `PEOPLE`. */
const REVIEWS: readonly (readonly [number, number, number])[] = [
  [0, 1, 9],
  [0, 2, 4],
  [0, 3, 6],
  [1, 2, 7],
  [1, 4, 2],
  [2, 5, 3],
  [3, 4, 5],
  [3, 6, 8],
  [4, 7, 3],
  [5, 6, 6],
  [5, 8, 2],
  [6, 9, 4],
  [7, 8, 9],
  [7, 10, 5],
  [8, 11, 3],
  [9, 10, 2],
  [9, 12, 6],
  [10, 13, 7],
  [11, 12, 4],
  [11, 13, 3],
  [12, 13, 8],
  [0, 13, 2],
  [2, 11, 3],
  [4, 9, 2],
  [1, 12, 2],
  [6, 10, 3],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'graph3d',
        node: { label: PEOPLE, sizeby: 'degree', sizerange: [12, 26] },
        link: {
          source: REVIEWS.map((r) => r[0]),
          target: REVIEWS.map((r) => r[1]),
          value: REVIEWS.map((r) => r[2]),
          widthby: 'value',
          widthrange: [1, 6],
        },
      },
    ],
    layout: {
      title: { text: 'Who reviews whose work' },
      margin: { l: 0, r: 0, t: 50, b: 0 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
