import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Box plots from precomputed statistics (plan E10.4): `q1`, `median` and `q3` (one value per box)
 * switch the trace from samples to statistics, with `lowerfence` / `upperfence` for the whiskers,
 * `mean` and `sd` (which turn `boxmean: 'sd'` on) and `notchspan` (which turns `notched` on).
 * Positions come from `x`. Useful when only summaries are stored, e.g. from a database.
 */
export const meta: ExampleMeta = {
  title: 'Box: precomputed statistics',
  description:
    'Boxes drawn from q1, median, q3, fences, mean, sd and notch spans instead of samples.',
  tags: ['box', 'statistical', 'distribution', 'precomputed'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'box',
        name: 'Quarterly revenue',
        x: ['Q1', 'Q2', 'Q3', 'Q4'],
        q1: [42, 48, 51, 60],
        median: [47, 52, 58, 66],
        q3: [53, 57, 64, 74],
        lowerfence: [30, 36, 40, 45],
        upperfence: [68, 70, 80, 95],
        mean: [48, 52.5, 57, 67.5],
        sd: [7, 6, 8.5, 11],
        notchspan: [2.5, 2, 3, 3.5],
      },
    ],
    layout: {
      title: { text: 'Store revenue per quarter (summaries)' },
      yaxis: { title: { text: 'kUSD' } },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
