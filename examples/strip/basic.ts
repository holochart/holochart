import { createChart, strip } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { tips } from './tips.mts';

/**
 * A strip plot (plan E10.6) with the `strip` helper, Holochart's `px.strip`: every row of a table
 * is one jittered point at its category. The helper builds a `box` trace with `boxpoints: 'all'`,
 * `pointpos: 0` and an invisible box, so the points spread around the category's center line.
 */
export const meta: ExampleMeta = {
  title: 'Strip: basic',
  description: 'Every restaurant bill as a jittered point per day, built with the strip helper.',
  tags: ['strip', 'box', 'statistical', 'distribution', 'jitter', 'basic'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const figure = strip({
    data: tips(),
    x: 'day',
    y: 'total_bill',
    labels: { total_bill: 'Total bill (USD)' },
    categoryOrders: { day: ['Thu', 'Fri', 'Sat', 'Sun'] },
    title: 'Bills by day',
  });
  const chart = createChart(el, figure);

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
