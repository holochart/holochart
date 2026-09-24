import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A normalized histogram (plan E10.1): `histnorm: 'probability density'` scales each bar to the
 * share of samples per unit of bin width, so the bar areas sum to 1 and the histogram can be
 * compared with a density curve — here the normal distribution the samples were drawn from, as
 * a line on the same axes. `nbinsx: 40` asks for at most 40 bins (the size is still rounded).
 */
export const meta: ExampleMeta = {
  title: 'Histogram: probability density',
  description:
    'histnorm "probability density" with nbinsx 40, compared with the normal density curve the samples came from.',
  tags: ['histogram', 'chart', 'histnorm', 'density', 'statistical'],
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(11));
  const mu = 170;
  const sigma = 8;
  const x = Array.from({ length: 2000 }, () => mu + sigma * normal());
  const curveX = Array.from({ length: 121 }, (_, i) => mu - 4 * sigma + (i * 8 * sigma) / 120);
  const curveY = curveX.map(
    (v) => Math.exp(-0.5 * ((v - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI)),
  );
  const chart = createChart(el, {
    data: [
      {
        type: 'histogram',
        x,
        name: 'Sample (n = 2000)',
        histnorm: 'probability density',
        nbinsx: 40,
      },
      { type: 'scatter', mode: 'lines', x: curveX, y: curveY, name: 'Normal(170, 8)' },
    ],
    layout: {
      title: { text: 'Heights: sample vs model' },
      xaxis: { title: { text: 'Height (cm)' } },
      yaxis: { title: { text: 'Probability density' } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
