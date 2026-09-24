import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Box plots with every sample (plan E10.4): `boxpoints: 'all'` draws all samples beside their box
 * (`pointpos: -1.8` box half-widths to the left) with a `jitter` of 0.3, a repeatable spread that
 * is wider where samples are dense. The second trace uses `'suspectedoutliers'`: only samples
 * beyond the whiskers, with those within 3 IQR of the quartiles styled by `marker.outliercolor`
 * and `marker.line.outlier*`.
 */
export const meta: ExampleMeta = {
  title: 'Box: all points with jitter',
  description:
    'All samples drawn beside the box with jitter, next to a box that highlights suspected outliers.',
  tags: ['box', 'statistical', 'distribution', 'points', 'jitter', 'outliers'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(9));
  const draw = (n: number, mu: number, sigma: number) =>
    Array.from({ length: n }, () => mu + sigma * normal());
  const chart = createChart(el, {
    data: [
      {
        type: 'box',
        name: 'All points',
        y: [...draw(70, 20, 3), 33, 8],
        boxpoints: 'all',
        jitter: 0.3,
        pointpos: -1.8,
      },
      {
        type: 'box',
        name: 'Suspected outliers',
        y: [...draw(70, 20, 3), 29.5, 30.5, 42, 10.5],
        boxpoints: 'suspectedoutliers',
        marker: {
          outliercolor: 'rgba(234, 42, 55, 0.6)',
          line: { outliercolor: '#ea2a37', outlierwidth: 2 },
        },
      },
    ],
    layout: {
      title: { text: 'Latency samples' },
      yaxis: { title: { text: 'ms' } },
      showlegend: false,
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
