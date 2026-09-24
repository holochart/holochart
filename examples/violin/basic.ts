import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Basic violins (plan E10.5): three samples given as `y` only, each drawn at its trace name as a
 * mirrored Gaussian kernel density estimate (bandwidth by Silverman's rule, `spanmode: 'soft'`:
 * two bandwidths past the extreme samples). The bimodal sample shows what a box plot would hide.
 * Outliers beyond the 1.5 IQR fences are drawn as points, as with box plots.
 */
export const meta: ExampleMeta = {
  title: 'Violin: basic',
  description:
    'Three samples as violins at their trace names: kernel density estimates with Silverman bandwidths, one bimodal.',
  tags: ['violin', 'statistical', 'distribution', 'kde', 'basic'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(7));
  const draw = (n: number, mu: number, sigma: number) =>
    Array.from({ length: n }, () => mu + sigma * normal());
  const chart = createChart(el, {
    data: [
      { type: 'violin', name: 'Unimodal', y: draw(200, 10, 2) },
      { type: 'violin', name: 'Bimodal', y: [...draw(110, 6, 1.4), ...draw(90, 14, 1.8)] },
      { type: 'violin', name: 'Skewed', y: draw(200, 0, 1).map((v) => 5 + Math.exp(v * 0.55) * 3) },
    ],
    layout: {
      title: { text: 'Three distributions' },
      yaxis: { title: { text: 'value' }, zeroline: false },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
