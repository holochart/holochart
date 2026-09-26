import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { tips } from './datasets.mts';

/**
 * A facet grid (plan E23.3): `facetRow: 'time'` and `facetCol: 'day'` give one scatter subplot per
 * (meal, day), with the column labels on top and the row labels rotated on the right, as
 * `px.scatter(facet_row=…, facet_col=…)` lays them out. Every axis `matches` the first, so the
 * panels compare directly.
 */
export const meta: ExampleMeta = {
  title: 'Express: facet grid of scatter plots',
  description: 'Tips against bills per meal time (rows) and day (columns), colored by smoker.',
  tags: ['express', 'scatter', 'facets', 'subplots', 'annotations'],
  size: { width: 720, height: 460 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const figure = hx.scatter(tips(), {
    x: 'total_bill',
    y: 'tip',
    color: 'smoker',
    facetRow: 'time',
    facetCol: 'day',
    categoryOrders: { day: ['Thu', 'Fri', 'Sat', 'Sun'], time: ['Lunch', 'Dinner'] },
    labels: { total_bill: 'Bill', tip: 'Tip' },
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
