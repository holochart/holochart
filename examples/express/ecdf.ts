import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { tips } from './datasets.mts';

/**
 * An ECDF (plan E10.7) with `hx.ecdf`, `px.ecdf`'s counterpart: per group, a step line
 * (`line.shape: 'hv'`) through the sorted bills and the share of bills at or below each, so the
 * distributions compare without choosing bins. A rug of the bills sits above (`marginal: 'rug'`).
 */
export const meta: ExampleMeta = {
  title: 'Express: ECDF by group with a rug',
  description:
    'Empirical cumulative distribution of bills for lunch and dinner, with a rug of the values above.',
  tags: ['express', 'ecdf', 'scatter', 'statistical', 'distribution', 'marginal'],
  size: { width: 640, height: 420 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const figure = hx.ecdf(tips(), {
    x: 'total_bill',
    color: 'time',
    marginal: 'rug',
    labels: { total_bill: 'Total bill (USD)' },
    title: 'Share of bills at or below each amount',
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
