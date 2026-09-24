import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Two distributions overlaid (plan E10.1): `barmode: 'overlay'` draws both histograms over each
 * other, translucent (`opacity`) so both stay readable. Overlaid histograms bin independently —
 * each gets its own automatic bin size and bar width, as in Plotly — unless they share a
 * `bingroup`; here `bingroup: 'latency'` gives them the same bins, so the bars line up.
 */
export const meta: ExampleMeta = {
  title: 'Histogram: overlaid distributions',
  description: 'Two latency distributions overlaid with opacity, sharing bins through a bingroup.',
  tags: ['histogram', 'chart', 'overlay', 'barmode', 'bingroup', 'statistical'],
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(21));
  const before = Array.from({ length: 700 }, () => 118 + 22 * normal());
  const after = Array.from({ length: 700 }, () => 86 + 15 * normal());
  const chart = createChart(el, {
    data: [
      { type: 'histogram', x: before, name: 'Before cache', opacity: 0.6, bingroup: 'latency' },
      { type: 'histogram', x: after, name: 'After cache', opacity: 0.6, bingroup: 'latency' },
    ],
    layout: {
      title: { text: 'Page latency before and after caching' },
      barmode: 'overlay',
      xaxis: { title: { text: 'Latency (ms)' } },
      yaxis: { title: { text: 'Page loads' } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
