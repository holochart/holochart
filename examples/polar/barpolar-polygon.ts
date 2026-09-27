import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Polar bars on a polygon grid (plan E11.5): with `gridshape: 'linear'` bars follow the grid's
 * straight edges instead of arcs, and `polar.hole` leaves the middle free for a label-less core.
 */
export const meta: ExampleMeta = {
  title: 'Polar: bars on a polygon grid',
  description: 'Stacked barpolar traces on a hexagon grid with a hole.',
  tags: ['polar', 'barpolar', 'gridshape', 'hole'],
  testTolerance: 0.004,
};

const TEAMS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      { type: 'barpolar', theta: TEAMS, r: [3, 4, 2, 5, 3, 4], name: 'Q1' },
      { type: 'barpolar', theta: TEAMS, r: [2, 1, 3, 2, 4, 2], name: 'Q2' },
      { type: 'barpolar', theta: TEAMS, r: [1, 2, 2, 1, 1, 3], name: 'Q3' },
    ],
    layout: {
      title: { text: 'Bars on a hexagon grid' },
      polar: { gridshape: 'linear', hole: 0.2, bargap: 0.15, radialaxis: { angle: 30 } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
