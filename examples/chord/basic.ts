import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A basic `chord` trace (backlog G8) from a square matrix: `matrix[i][j]` is the number of trips
 * from district `i` to district `j` (invented numbers). Every district is an arc of the ring, as
 * wide as its trips out plus its trips in, and every positive cell is a ribbon in the color of
 * the district it starts in. Trips within a district (the diagonal) are hills on its own arc.
 * Hover an arc to see its ribbons and dim the rest.
 *
 * The chord diagram is not part of the full bundle: `import '@mk7s/holochart/graph'` registers
 * it.
 */
export const meta: ExampleMeta = {
  title: 'Chord: basic',
  description: 'Trips between five districts, from a square matrix.',
  tags: ['chord', 'network', 'matrix', 'domain', 'basic'],
  size: { width: 560, height: 520 },
  testTolerance: 0.004,
};

const DISTRICTS = ['Harbor', 'Old Town', 'Campus', 'Hillside', 'Station'];

/** Trips per day, in thousands: from the row's district to the column's. */
const TRIPS = [
  [12, 34, 9, 6, 28],
  [31, 8, 22, 11, 40],
  [7, 25, 15, 5, 19],
  [5, 14, 4, 3, 21],
  [30, 37, 18, 24, 6],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [{ type: 'chord', matrix: TRIPS, labels: DISTRICTS, valuesuffix: 'k' }],
    layout: {
      title: { text: 'Trips between districts' },
      margin: { l: 30, r: 30, t: 60, b: 30 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
