import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Notched boxes with the mean and standard deviation (plan E10.4): `notched: true` cuts notches at
 * the median's 95% confidence interval (median ± 1.57 · IQR / √n) — boxes whose notches don't
 * overlap have different medians with roughly 95% confidence — and `boxmean: 'sd'` adds the mean as
 * a dashed line with a dashed diamond spanning ± one standard deviation.
 */
export const meta: ExampleMeta = {
  title: 'Box: notched, with mean and sd',
  description:
    'Notches at the median’s 95% confidence interval, and the mean with a ± σ diamond (boxmean sd).',
  tags: ['box', 'statistical', 'distribution', 'notched', 'mean'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(5));
  const draw = (n: number, mu: number, sigma: number) =>
    Array.from({ length: n }, () => mu + sigma * normal());
  const chart = createChart(el, {
    data: [
      { type: 'box', name: 'Batch 1', y: draw(80, 102, 6), notched: true, boxmean: 'sd' },
      { type: 'box', name: 'Batch 2', y: draw(80, 99, 5), notched: true, boxmean: 'sd' },
      { type: 'box', name: 'Batch 3', y: draw(40, 108, 9), notched: true, boxmean: 'sd' },
    ],
    layout: {
      title: { text: 'Tensile strength' },
      yaxis: { title: { text: 'MPa' } },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
