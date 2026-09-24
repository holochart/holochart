import { createChart } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Cumulative histograms (plan E10.1): `cumulative.enabled` sums each bin with the ones before it.
 * With `histnorm: 'percent'` the bars rise to 100 %, an empirical CDF of the samples. The second
 * trace accumulates `decreasing` (the share of sessions at least that long), and both use
 * `currentbin: 'half'`, which counts half of the current bin and removes the half-bin bias.
 * Explicit `xbins` give one-minute bins.
 */
export const meta: ExampleMeta = {
  title: 'Histogram: cumulative',
  description:
    'Increasing and decreasing cumulative histograms in percent (currentbin "half") over one-minute bins.',
  tags: ['histogram', 'chart', 'cumulative', 'cdf', 'statistical'],
};

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(3);
  // Session lengths in minutes: exponential with a 9-minute mean.
  const x = Array.from({ length: 600 }, () => -9 * Math.log(1 - random()));
  const bins = { start: 0, end: 40, size: 1 };
  const chart = createChart(el, {
    data: [
      {
        type: 'histogram',
        x,
        xbins: bins,
        histnorm: 'percent',
        name: 'Shorter than',
        cumulative: { enabled: true, currentbin: 'half' },
      },
      {
        type: 'histogram',
        x,
        xbins: bins,
        histnorm: 'percent',
        name: 'At least',
        cumulative: { enabled: true, direction: 'decreasing', currentbin: 'half' },
      },
    ],
    layout: {
      title: { text: 'Session length distribution' },
      barmode: 'overlay',
      xaxis: { title: { text: 'Minutes' } },
      yaxis: { title: { text: 'Sessions (%)' }, ticksuffix: '%' },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
