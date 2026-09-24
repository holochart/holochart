import { createChart, strip } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { tips } from './tips.mts';

/**
 * A horizontal strip plot (plan E10.6): with a numeric `x` and a categorical `y`, the helper makes
 * horizontal strips (as `px.strip` does). `hoverName` and `hoverData` add columns to the hover
 * label, and a wider `jitter` (a Holochart option) spreads dense strips further.
 */
export const meta: ExampleMeta = {
  title: 'Strip: horizontal',
  description:
    'Tips per party size as horizontal strips, with a wider jitter and extra hover columns.',
  tags: ['strip', 'box', 'statistical', 'distribution', 'horizontal'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const rows = tips().map((r) => ({
    ...r,
    party: `${r.size} ${r.size === 1 ? 'guest' : 'guests'}`,
  }));
  const figure = strip({
    data: rows,
    x: 'tip',
    y: 'party',
    hoverName: 'day',
    hoverData: ['total_bill'],
    jitter: 0.6,
    labels: { tip: 'Tip (USD)', party: 'Party', total_bill: 'Bill' },
    categoryOrders: {
      party: ['1 guest', '2 guests', '3 guests', '4 guests', '5 guests', '6 guests'],
    },
    title: 'Tips by party size',
  });
  const chart = createChart(el, figure);

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
