import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { tips } from './datasets.mts';

/**
 * Express faceting (plan E23.3): `facetCol: 'day'` with `facetColWrap: 2` puts one histogram
 * subplot per day in a 2 × 2 grid, row by row from the top, each labelled `day=…` above it. The
 * subplots' axes are linked with `matches`, so they share bins' scale and zoom together; tick
 * labels show on the outer axes only. `color` stacks one histogram per sex in every panel, with one
 * legend entry each.
 */
export const meta: ExampleMeta = {
  title: 'Express: faceted histogram with wrapping',
  description:
    'Bill totals per day in a wrapped 2 × 2 facet grid, stacked by sex, axes linked across panels.',
  tags: ['express', 'histogram', 'facets', 'subplots', 'matches'],
  size: { width: 640, height: 480 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const figure = hx.histogram(tips(), {
    x: 'total_bill',
    color: 'sex',
    facetCol: 'day',
    facetColWrap: 2,
    nbins: 20,
    categoryOrders: { day: ['Thu', 'Fri', 'Sat', 'Sun'] },
    labels: { total_bill: 'Total bill (USD)' },
    title: 'Bills per day',
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
