import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Lines colored by a numeric dimension (plan E10.10): `line.color` takes one number per line and
 * maps it through `line.colorscale` (the default look's sequential ramp), with a colorbar
 * (`line.showscale`). Lines with higher values are drawn on top, as in Plotly. The cylinder axis
 * is ordinal: `tickvals` puts its ticks on the three values.
 */
export const meta: ExampleMeta = {
  title: 'Parallel coordinates: colorscale',
  description: '400 cars across six measurements, each line colored by its fuel economy.',
  tags: ['parcoords', 'statistical', 'domain', 'colorscale', 'colorbar'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(23);
  const normal = gaussian(random);
  const cyl: number[] = [];
  const hp: number[] = [];
  const weight: number[] = [];
  const accel: number[] = [];
  const year: number[] = [];
  const mpg: number[] = [];
  for (let i = 0; i < 400; i++) {
    const c = [4, 4, 4, 6, 6, 8][Math.floor(random() * 6)]!;
    const y = 70 + Math.floor(random() * 13);
    const h = Math.round(Math.max(46, 20 * c - 10 + 18 * normal()));
    const w = Math.round(Math.max(1600, 1000 + 12 * h + 260 * normal()));
    cyl.push(c);
    hp.push(h);
    weight.push(w);
    accel.push(+Math.max(8, 22 - h / 18 + 1.5 * normal()).toFixed(1));
    year.push(y);
    mpg.push(+Math.max(9, 58 - w / 110 + 0.6 * (y - 70) + 2 * normal()).toFixed(1));
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'parcoords',
        line: { color: mpg, showscale: true, colorbar: { title: { text: 'MPG' } } },
        dimensions: [
          { label: 'Cylinders', values: cyl, tickvals: [4, 6, 8], range: [3.5, 8.5] },
          { label: 'Horsepower', values: hp },
          { label: 'Weight (lb)', values: weight, tickformat: ',' },
          { label: 'Acceleration (s)', values: accel },
          { label: 'Model year', values: year, tickformat: 'd' },
          { label: 'MPG', values: mpg },
        ],
      },
    ],
    layout: {
      title: { text: 'Cars: fuel economy' },
      margin: { t: 64, l: 48, r: 72, b: 32 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
