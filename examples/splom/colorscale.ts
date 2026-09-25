import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A scatter plot matrix colored by a numeric column (plan E10.9): `marker.color` holds one number
 * per sample, mapped through the colorscale (the default look's sequential ramp) on the GPU, with
 * a colorbar (`marker.showscale`). The column need not be a dimension: here fuel economy colors
 * four other measurements of the same cars.
 */
export const meta: ExampleMeta = {
  title: 'Scatter plot matrix: colorscale',
  description:
    'Four car measurements colored by fuel economy through a colorscale, with a colorbar.',
  tags: ['splom', 'statistical', 'colorscale', 'colorbar'],
  size: { width: 640, height: 600 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(11));
  const n = 300;
  const weight: number[] = [];
  const power: number[] = [];
  const accel: number[] = [];
  const year: number[] = [];
  const mpg: number[] = [];
  for (let i = 0; i < n; i++) {
    const size = normal();
    const y = 1970 + Math.floor((i / n) * 13);
    const w = 2900 + 800 * size + 120 * normal();
    const hp = 60 + w * 0.028 + 14 * normal() - (y - 1970) * 1.5;
    weight.push(Math.round(w));
    power.push(Math.round(hp));
    accel.push(Math.round((22 - hp * 0.055 + 1.3 * normal()) * 10) / 10);
    year.push(y);
    mpg.push(Math.round((52 - w * 0.0078 + (y - 1970) * 0.75 + 2 * normal()) * 10) / 10);
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'splom',
        name: 'cars',
        dimensions: [
          { label: 'weight (lb)', values: weight },
          { label: 'horsepower', values: power },
          { label: '0–60 (s)', values: accel },
          { label: 'model year', values: year },
        ],
        text: mpg.map((v) => `${v} mpg`),
        marker: {
          color: mpg,
          showscale: true,
          colorbar: { title: { text: 'mpg' } },
          size: 4,
        },
      },
    ],
    layout: { title: { text: 'Cars by fuel economy' } },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
