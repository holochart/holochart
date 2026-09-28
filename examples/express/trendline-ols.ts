import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { tips } from './datasets.mts';

/**
 * Express OLS trendlines (plan E23.5): `trendline: 'ols'` fits a least-squares line per group —
 * here per smoker group in each meal-time facet — and draws it as a `scatter` line in the group's
 * color, hidden from the legend (as `px.scatter(..., trendline="ols")`). Hovering a line shows
 * the fitted equation and R²; `hx.getTrendlineResults(figure)` returns the fits.
 */
export const meta: ExampleMeta = {
  title: 'Express: OLS trendlines with facets',
  description:
    'Tips against bill totals per smoker group, faceted by meal time, with a least-squares line per group.',
  tags: ['express', 'scatter', 'trendline', 'ols', 'facets', 'regression'],
  size: { width: 640, height: 420 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const figure = hx.scatter(tips(), {
    x: 'total_bill',
    y: 'tip',
    color: 'smoker',
    facetCol: 'time',
    trendline: 'ols',
    categoryOrders: { time: ['Lunch', 'Dinner'] },
    labels: { total_bill: 'Total bill (USD)', tip: 'Tip (USD)' },
    opacity: 0.65,
    title: 'Tips grow with the bill',
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
