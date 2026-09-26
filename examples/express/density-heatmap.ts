import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { tips } from './datasets.mts';

/**
 * A density heatmap with marginal histograms (plan E23.6, E10.8): `px.density_heatmap`'s
 * `histogram2d` counting rows per bill × tip bin on a colorscale (`coloraxis`, colorbar "count"),
 * with histograms of each variable above and to the right sharing its axes.
 */
export const meta: ExampleMeta = {
  title: 'Express: density heatmap with marginal histograms',
  description: 'Counts of bills and tips in 2D bins, with a histogram of each on the sides.',
  tags: ['express', 'histogram2d', 'heatmap', 'marginal', 'histogram', 'coloraxis'],
  size: { width: 640, height: 480 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const figure = hx.densityHeatmap(tips(), {
    x: 'total_bill',
    y: 'tip',
    nbinsx: 20,
    nbinsy: 16,
    marginalX: 'histogram',
    marginalY: 'histogram',
    labels: { total_bill: 'Total bill (USD)', tip: 'Tip (USD)' },
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
