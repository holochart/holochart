import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A chord diagram on a dark template (backlog G8), from a symmetric matrix with
 * `directed: false`: every pair of nodes has one ribbon, and `link.colorsource: 'gradient'`
 * runs its color from one node's to the other's. The node colors are the dark template's
 * colorway and the labels its font color. The data: how often two instruments play together in
 * a set of recordings (invented numbers).
 */
export const meta: ExampleMeta = {
  title: 'Chord: dark template, gradient ribbons',
  description: 'A symmetric matrix on the dark template, with ribbons shaded from end to end.',
  tags: ['chord', 'network', 'matrix', 'template', 'dark', 'gradient', 'domain'],
  size: { width: 560, height: 520 },
  testTolerance: 0.004,
};

const INSTRUMENTS = ['Piano', 'Bass', 'Drums', 'Sax', 'Trumpet', 'Guitar', 'Voice'];

const TOGETHER = [
  [0, 48, 44, 21, 14, 9, 26],
  [48, 0, 52, 24, 17, 15, 12],
  [44, 52, 0, 27, 19, 18, 10],
  [21, 24, 27, 0, 16, 4, 3],
  [14, 17, 19, 16, 0, 2, 5],
  [9, 15, 18, 4, 2, 0, 13],
  [26, 12, 10, 3, 5, 13, 0],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'chord',
        directed: false,
        matrix: TOGETHER,
        labels: INSTRUMENTS,
        padangle: 3,
        link: { colorsource: 'gradient', opacity: 0.7 },
      },
    ],
    layout: {
      template: 'plotly_dark',
      title: { text: 'Who plays with whom' },
      margin: { l: 30, r: 30, t: 60, b: 30 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
