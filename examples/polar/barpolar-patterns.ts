import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Polar bars with patterns (plan E11.5, E8.10): barpolar takes bar's `marker.pattern`, here one
 * shape per trace on a circular grid (left, the arc primitive: tiles anchored at the pole) and per
 * bar (`shape` arrayOk) on a hexagonal grid (right, `gridshape: 'linear'`: polygon fills).
 */
export const meta: ExampleMeta = {
  title: 'Polar: bars with patterns',
  description: 'Stacked barpolar traces hatched per trace, and per bar on a hexagonal grid.',
  tags: ['polar', 'barpolar', 'bars', 'pattern', 'subplots'],
  testTolerance: 0.004,
};

const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const TEAMS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'barpolar',
        r: [3, 2, 4, 5, 2, 3, 4, 2],
        theta: DIRECTIONS,
        name: 'Spring',
        marker: { pattern: { shape: '/' } },
      },
      {
        type: 'barpolar',
        r: [2, 3, 1, 2, 4, 2, 1, 3],
        theta: DIRECTIONS,
        name: 'Autumn',
        marker: { pattern: { shape: '.', fillmode: 'overlay' } },
      },
      {
        type: 'barpolar',
        subplot: 'polar2',
        theta: TEAMS,
        r: [3, 4, 2, 5, 3, 4],
        name: 'Teams',
        marker: { pattern: { shape: ['/', '\\', 'x', '-', '|', '+'], size: 6 } },
      },
    ],
    layout: {
      title: { text: 'Polar bars with patterns' },
      polar: { domain: { x: [0, 0.46] }, angularaxis: { direction: 'clockwise' } },
      polar2: { domain: { x: [0.54, 1] }, gridshape: 'linear', hole: 0.2, bargap: 0.15 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
