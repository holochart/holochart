import { createChart } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Histograms stacked with bars (plan E10.1, E9.9): histograms and bars share one stack group per
 * subplot, as in Plotly. Two histograms bin raw order times by hour (`xbins` of size 1 centered
 * on whole hours; under `barmode: 'stack'` the histograms of a subplot share their bins), and a
 * `bar` trace of pre-counted phone orders at the same hours stacks on top of them.
 */
export const meta: ExampleMeta = {
  title: 'Histogram: stacked with bars',
  description:
    'Web and app orders binned by hour (histograms) stacked with pre-counted phone orders (bars).',
  tags: ['histogram', 'bar', 'chart', 'stack', 'barmode', 'statistical'],
};

/** Order times (fractional hours) around a lunch and an evening peak. */
function orderTimes(seed: number, count: number, evening: number): number[] {
  const random = rng(seed);
  return Array.from({ length: count }, () => {
    const peak = random() < evening ? 19 : 12.5;
    const t = peak + (random() + random() + random() - 1.5) * 4;
    return Math.min(22.99, Math.max(8, t));
  });
}

export function run(el: HTMLElement): ExampleHandle {
  const hours = Array.from({ length: 15 }, (_, i) => 8 + i);
  const phone = [2, 3, 5, 8, 9, 7, 4, 3, 3, 4, 6, 7, 6, 3, 1];
  const bins = { start: 7.5, end: 22.5, size: 1 };
  const chart = createChart(el, {
    data: [
      { type: 'histogram', x: orderTimes(5, 420, 0.45), name: 'Web', xbins: bins },
      { type: 'histogram', x: orderTimes(6, 260, 0.6), name: 'App', xbins: bins },
      { type: 'bar', x: hours, y: phone, name: 'Phone' },
    ],
    layout: {
      title: { text: 'Orders per hour by channel' },
      barmode: 'stack',
      xaxis: { title: { text: 'Hour of day' }, dtick: 2 },
      yaxis: { title: { text: 'Orders' } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
