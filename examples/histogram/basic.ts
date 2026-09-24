import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A basic histogram (plan E10.1): 800 response times, binned automatically. Plotly's auto-bin
 * rule picks a round bin size from the spread and the sample count (here 5 ms bins), and with a
 * histogram on the axis `bargap` defaults to 0, so the bars touch. Hover shows each bin's range
 * (`45 - 49.99`) and its count.
 */
export const meta: ExampleMeta = {
  title: 'Histogram: basic',
  description: '800 response times binned automatically into round 5 ms bins, bars touching.',
  tags: ['histogram', 'chart', 'basic', 'statistical'],
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(7));
  const x = Array.from({ length: 800 }, () => Math.round((62 + 11 * normal()) * 100) / 100);
  const chart = createChart(el, {
    data: [{ type: 'histogram', x, name: 'Response time' }],
    layout: {
      title: { text: 'API response times' },
      xaxis: { title: { text: 'Response time (ms)' } },
      yaxis: { title: { text: 'Requests' } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
