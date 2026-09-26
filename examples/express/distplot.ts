import { createChart } from '@mk7s/holochart';
import { ff } from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { samples } from './datasets.mts';

/**
 * A distribution plot (plan E10.8) with `ff.distplot`, plotly.py's `create_distplot`: per group, a
 * probability-density histogram, a Gaussian KDE curve (Scott's rule, like scipy's `gaussian_kde`)
 * over it and a rug of the samples in a strip below, sharing the x axis.
 */
export const meta: ExampleMeta = {
  title: 'Express: distplot (histogram, KDE and rug)',
  description:
    'Three samples as overlaid density histograms with KDE curves, and a rug of each below.',
  tags: ['express', 'distplot', 'histogram', 'kde', 'statistical', 'distribution'],
  size: { width: 640, height: 440 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { values, labels } = samples();
  const figure = ff.distplot(values, labels, { binSize: 0.25 });
  figure.layout['title'] = { text: 'Three distributions' };
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
