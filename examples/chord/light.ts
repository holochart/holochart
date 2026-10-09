import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A chord diagram on a light template (backlog G8), with the other way to show direction: the
 * ribbons touch the arc they leave and stop short of the arc they enter (`link.targetgap`), and
 * they take the color of their target (`link.colorsource`), so an arc's own color shows what it
 * receives. `sort: 'value'` puts the widest arc first and `direction: 'counterclockwise'` runs
 * the ring the other way round. The node colors are the light template's colorway, the labels
 * its font color and the outlines its paper color. The data: which plan customers moved from and
 * to in a year (invented numbers).
 */
export const meta: ExampleMeta = {
  title: 'Chord: light template, colored by target',
  description: 'Directed ribbons inset at their target, on a light template, sorted by value.',
  tags: ['chord', 'network', 'directed', 'template', 'light', 'sort', 'domain'],
  size: { width: 560, height: 520 },
  testTolerance: 0.004,
};

const PLANS = ['Free', 'Starter', 'Team', 'Business', 'Enterprise', 'Left'];

/** `[from, to, customers]`. */
const MOVES: readonly (readonly [number, number, number])[] = [
  [0, 1, 420],
  [0, 2, 130],
  [0, 5, 610],
  [1, 2, 260],
  [1, 0, 90],
  [1, 5, 150],
  [2, 3, 140],
  [2, 1, 60],
  [2, 5, 70],
  [3, 4, 55],
  [3, 2, 35],
  [3, 5, 25],
  [4, 3, 12],
  [4, 5, 8],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'chord',
        sort: 'value',
        direction: 'counterclockwise',
        padangle: 3,
        node: {
          label: PLANS,
          line: { width: 1 },
          hovertemplate: '%{label}<br>%{out} moved away, %{in} moved here<extra>%{percent}</extra>',
        },
        link: {
          source: MOVES.map((m) => m[0]),
          target: MOVES.map((m) => m[1]),
          value: MOVES.map((m) => m[2]),
          colorsource: 'target',
          gap: 1,
          targetgap: 8,
        },
      },
    ],
    layout: {
      template: 'plotly_white',
      title: { text: 'Plan changes in a year' },
      margin: { l: 30, r: 30, t: 60, b: 30 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
