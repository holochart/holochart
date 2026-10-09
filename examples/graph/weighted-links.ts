import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Weighted links (backlog G1, G2): `link.value` is a number per link. The force layout reads it
 * as the link's weight (`force.linkweight`: here `'distance'`, so a larger value makes a shorter
 * link), and `link.widthby: 'value'` draws it: widths are proportional to the value, between the
 * two widths of `link.widthrange`. Hover a link for its value.
 *
 * Here: ingredients, and in how many recipes of a (made-up) cookbook two of them appear together.
 */
export const meta: ExampleMeta = {
  title: 'Graph: link width by value',
  description: 'Links as wide as their value, and shorter the larger it is.',
  tags: ['graph', 'network', 'weighted', 'width', 'value', 'force'],
  size: { width: 720, height: 520 },
  testTolerance: 0.004,
};

const INGREDIENTS = [
  'Tomato',
  'Basil',
  'Garlic',
  'Olive oil',
  'Onion',
  'Mozzarella',
  'Lemon',
  'Butter',
  'Cream',
  'Parmesan',
  'Chili',
  'Parsley',
  'Mushroom',
  'Thyme',
];

/** Two ingredients and the number of recipes that use both. */
const TOGETHER: readonly (readonly [number, number, number])[] = [
  [0, 1, 31],
  [0, 2, 38],
  [0, 3, 44],
  [0, 4, 29],
  [0, 5, 22],
  [1, 5, 19],
  [1, 3, 17],
  [2, 3, 52],
  [2, 4, 41],
  [2, 10, 16],
  [2, 11, 14],
  [3, 6, 21],
  [3, 10, 9],
  [4, 7, 18],
  [6, 11, 12],
  [6, 7, 8],
  [7, 8, 24],
  [7, 12, 15],
  [7, 13, 11],
  [8, 9, 20],
  [8, 12, 17],
  [9, 1, 7],
  [9, 2, 10],
  [12, 13, 13],
  [12, 2, 12],
  [5, 3, 6],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        arrangement: 'force',
        force: { linkweight: 'distance', linkdistance: 110, charge: -220 },
        node: { label: INGREDIENTS, size: 13, color: '#e0a03c' },
        link: {
          source: TOGETHER.map((t) => t[0]),
          target: TOGETHER.map((t) => t[1]),
          value: TOGETHER.map((t) => t[2]),
          widthby: 'value',
          widthrange: [0.75, 9],
          hovertemplate: '%{source.label} and %{target.label}<br>%{value} recipes<extra></extra>',
        },
      },
    ],
    layout: {
      title: { text: 'What is cooked with what' },
      margin: { l: 20, r: 20, t: 60, b: 20 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
