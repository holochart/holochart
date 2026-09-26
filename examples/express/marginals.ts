import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { tips } from './datasets.mts';

/**
 * Marginal plots (plan E10.8): `marginalX: 'box'` draws a notched box of the bills above the
 * scatter and `marginalY: 'violin'` a violin of the tips on its right, one per color group, in
 * subplots that share the main plot's x and y axes (`matches`), as `px.scatter(marginal_x=…,
 * marginal_y=…)` does. The marginals' own axes are bare.
 */
export const meta: ExampleMeta = {
  title: 'Express: scatter with box and violin marginals',
  description:
    'Tips against bills by smoker, with a box plot of bills above and a violin of tips at the right.',
  tags: ['express', 'scatter', 'marginal', 'box', 'violin', 'subplots'],
  size: { width: 640, height: 480 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const figure = hx.scatter(tips(), {
    x: 'total_bill',
    y: 'tip',
    color: 'smoker',
    marginalX: 'box',
    marginalY: 'violin',
    labels: { total_bill: 'Total bill (USD)', tip: 'Tip (USD)' },
    title: 'Tips and bills, with marginal distributions',
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
