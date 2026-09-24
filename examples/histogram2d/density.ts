import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A density heatmap (plan E10.2): 50,000 request latencies against payload sizes, normalized with
 * `histnorm: 'probability density'` (each cell is its share of the samples per unit area, so the
 * grid integrates to 1) and smoothed with `zsmooth: 'fast'`. The colorbar is titled and formats its
 * ticks as small decimals; hover shows the bin ranges and the density.
 */
export const meta: ExampleMeta = {
  title: '2D histogram: density with colorbar',
  description:
    'Latency against payload size as a probability density (histnorm), smoothed, with a titled colorbar.',
  tags: ['histogram2d', 'statistical', 'histnorm', 'density', 'colorbar'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(5);
  const normal = gaussian(random);
  const size: number[] = [];
  const latency: number[] = [];
  for (let i = 0; i < 50000; i++) {
    const kb = Math.exp(3 + normal() * 0.6);
    size.push(kb);
    latency.push(
      20 + kb * 0.35 + Math.abs(normal()) * (8 + kb * 0.05) + (random() < 0.05 ? 40 : 0),
    );
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'histogram2d',
        x: size,
        y: latency,
        histnorm: 'probability density',
        xbins: { start: 0, end: 60, size: 2 },
        ybins: { start: 10, end: 90, size: 2.5 },
        zsmooth: 'fast',
        zhoverformat: '.2e',
        colorbar: { title: { text: 'density' }, tickformat: '.1e' },
      },
    ],
    layout: {
      title: { text: 'Request latency by payload size' },
      xaxis: { title: { text: 'payload (kB)' } },
      yaxis: { title: { text: 'latency (ms)' } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
