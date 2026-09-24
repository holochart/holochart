import { createChart, strip } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { tips } from './tips.mts';

/**
 * A strip plot over box plots (plan E10.6): the figure from `strip` is plain data, so a `box`
 * trace of the same samples can be added under it — the boxes summarize, the points show every
 * observation. The box trace hides its own points (`boxpoints: false`, so its whiskers reach the
 * extremes) and does not hover.
 */
export const meta: ExampleMeta = {
  title: 'Strip: over box plots',
  description:
    'Jittered points of every bill drawn over box plots of the same samples, from one strip figure.',
  tags: ['strip', 'box', 'statistical', 'distribution', 'recipe'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const rows = tips();
  const figure = strip({
    data: rows,
    x: 'day',
    y: 'tip',
    labels: { tip: 'Tip (USD)' },
    categoryOrders: { day: ['Thu', 'Fri', 'Sat', 'Sun'] },
    title: 'Tips by day',
  });
  const points = figure.data[0]!;
  points['marker'] = { size: 4, opacity: 0.8 };
  points['jitter'] = 0.5;
  figure.data.unshift({
    type: 'box',
    x: rows.map((r) => r.day),
    y: rows.map((r) => r.tip),
    boxpoints: false,
    hoverinfo: 'skip',
    showlegend: false,
  });
  figure.layout['boxmode'] = 'overlay';
  const chart = createChart(el, figure);

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
