import { createChart, strip } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { tips } from './tips.mts';

/**
 * A strip plot colored by a second column (plan E10.6): `color` makes one trace per value, placed
 * side by side in each category (`stripmode: 'group'`, the default, through `boxmode: 'group'` and
 * one `offsetgroup` per value). The legend shows markers, as for any box trace drawn as points
 * only.
 */
export const meta: ExampleMeta = {
  title: 'Strip: colored groups',
  description: 'One jittered strip per smoker group, side by side in each day, with a legend.',
  tags: ['strip', 'box', 'statistical', 'distribution', 'grouped'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const figure = strip({
    data: tips(),
    x: 'day',
    y: 'total_bill',
    color: 'smoker',
    labels: { total_bill: 'Total bill (USD)', smoker: 'Smoker' },
    categoryOrders: { day: ['Thu', 'Fri', 'Sat', 'Sun'], smoker: ['No', 'Yes'] },
    title: 'Bills by day and smoker',
  });
  const chart = createChart(el, figure);

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
