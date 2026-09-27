import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Polar bars (plan E11.5): one `barpolar` trace per series over compass directions, stacked
 * outwards (`polar.barmode: 'stack'`, the default) with Plotly's `bargap`, on a compass-style
 * angular axis (`direction: 'clockwise'` starts at 12 o'clock).
 */
export const meta: ExampleMeta = {
  title: 'Polar: bars',
  description: 'Two stacked barpolar traces on a clockwise category axis.',
  tags: ['polar', 'barpolar', 'bars', 'stack'],
  testTolerance: 0.004,
};

const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      { type: 'barpolar', r: [3, 2, 4, 5, 2, 3, 4, 2], theta: DIRECTIONS, name: 'Spring' },
      { type: 'barpolar', r: [2, 3, 1, 2, 4, 2, 1, 3], theta: DIRECTIONS, name: 'Autumn' },
    ],
    layout: {
      title: { text: 'Polar bars' },
      polar: { angularaxis: { direction: 'clockwise' } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
