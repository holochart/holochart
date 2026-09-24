import { createChart, strip } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { tips } from './tips.mts';

/**
 * Overlaid strips (plan E10.6): `stripmode: 'overlay'` draws the color groups on one strip per
 * category instead of side by side, so the groups mix and the strip shows the whole category.
 * Colors come from `colorDiscreteMap`.
 */
export const meta: ExampleMeta = {
  title: 'Strip: overlaid groups',
  description:
    'Lunch and dinner bills mixed on one strip per day (stripmode overlay), fixed colors.',
  tags: ['strip', 'box', 'statistical', 'distribution', 'overlay'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const figure = strip({
    data: tips(),
    x: 'day',
    y: 'total_bill',
    color: 'time',
    stripmode: 'overlay',
    colorDiscreteMap: { Lunch: '#cc540a', Dinner: '#128b8b' },
    labels: { total_bill: 'Total bill (USD)', time: 'Meal' },
    categoryOrders: { day: ['Thu', 'Fri', 'Sat', 'Sun'] },
    title: 'Bills by day, lunch and dinner overlaid',
  });
  const chart = createChart(el, figure);

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
