import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Two chord diagrams in one figure (backlog G8). The trace is a `domain` trace, so `domain.x`
 * places each ring like a pie: the left half and the right half of the figure. Both rings read
 * the same five districts in the same order, which is what makes them comparable; `rotation: 90`
 * starts the first arc at 3 o'clock, and `textorientation: 'radial'` writes the labels along the
 * radius, where they take the same room around both rings. The data: trips between districts on
 * a weekday and on a Sunday (invented numbers, in thousands).
 */
export const meta: ExampleMeta = {
  title: 'Chord: two diagrams side by side',
  description: 'Two chord traces placed with domain, rotated and labeled along the radius.',
  tags: ['chord', 'network', 'matrix', 'domain', 'subplots', 'rotation', 'labels'],
  size: { width: 860, height: 460 },
  testTolerance: 0.004,
};

const DISTRICTS = ['Harbor', 'Old Town', 'Campus', 'Hillside', 'Station'];

/** Trips in thousands: from the row's district to the column's. */
const WEEKDAY = [
  [12, 34, 9, 6, 28],
  [31, 8, 22, 11, 40],
  [7, 25, 15, 5, 19],
  [5, 14, 4, 3, 21],
  [30, 37, 18, 24, 6],
];
const SUNDAY = [
  [20, 18, 2, 4, 9],
  [26, 14, 3, 7, 12],
  [9, 11, 2, 1, 4],
  [8, 9, 1, 5, 6],
  [14, 10, 2, 5, 2],
];

export function run(el: HTMLElement): ExampleHandle {
  const ring = { rotation: 90, textorientation: 'radial', valuesuffix: 'k' } as const;
  const chart = createChart(el, {
    data: [
      {
        type: 'chord',
        name: 'Weekday',
        matrix: WEEKDAY,
        labels: DISTRICTS,
        domain: { x: [0, 0.48] },
        ...ring,
      },
      {
        type: 'chord',
        name: 'Sunday',
        matrix: SUNDAY,
        labels: DISTRICTS,
        domain: { x: [0.52, 1] },
        ...ring,
      },
    ],
    layout: {
      title: { text: 'Trips between districts' },
      margin: { l: 20, r: 20, t: 80, b: 20 },
      annotations: [
        { text: 'Weekday', x: 0.24, y: 1.04, xref: 'paper', yref: 'paper', showarrow: false },
        { text: 'Sunday', x: 0.76, y: 1.04, xref: 'paper', yref: 'paper', showarrow: false },
      ],
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
