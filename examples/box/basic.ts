import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Basic box plots (plan E10.4): three traces of samples given as `y` only, so each is one box at
 * its trace name on a category x axis (Plotly's behavior). Boxes span the quartiles with a line at
 * the median; whiskers reach the last samples within 1.5 IQR, and the samples beyond them are drawn
 * as outlier points (`boxpoints: 'outliers'`, the default).
 */
export const meta: ExampleMeta = {
  title: 'Box: basic',
  description:
    'Three samples as box plots at their trace names: quartiles, median, whiskers at 1.5 IQR and outlier points.',
  tags: ['box', 'statistical', 'distribution', 'basic'],
  testTolerance: 0.004,
};

/** `n` normal samples with mean `mu` and sd `sigma`, plus a few far values. */
function sample(seed: number, n: number, mu: number, sigma: number, far: number[]): number[] {
  const normal = gaussian(rng(seed));
  return [...Array.from({ length: n }, () => mu + sigma * normal()), ...far];
}

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      { type: 'box', name: 'Control', y: sample(1, 60, 42, 6, [71, 14]) },
      { type: 'box', name: 'Treatment A', y: sample(2, 60, 51, 8, [88]) },
      { type: 'box', name: 'Treatment B', y: sample(3, 60, 47, 4, [30, 66, 68]) },
    ],
    layout: {
      title: { text: 'Response time by group' },
      yaxis: { title: { text: 'ms' } },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
