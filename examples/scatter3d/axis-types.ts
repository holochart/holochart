import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * `scatter3d` on date, category and log axes (plan E14.2): `x` as dates (a year of weekly
 * samples), `y` as categories and `z` on a log axis. The scene detects the axis types from the
 * data (`z` is set to `log`); positions stay precise in float64 (dates are ms since the epoch).
 */
export const meta: ExampleMeta = {
  title: 'Scatter3D: date, category and log axes',
  description: 'Weekly samples on a date x axis, categories on y and a log z axis.',
  tags: ['scatter3d', '3d', 'dates', 'categories', 'log'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const regions = ['north', 'east', 'south', 'west'];
  const weeks = Array.from({ length: 52 }, (_, w) =>
    new Date(Date.UTC(2025, 0, 1 + w * 7)).toISOString().slice(0, 10),
  );
  const chart = createChart(el, {
    data: regions.map((region, k) => ({
      type: 'scatter3d',
      mode: 'lines+markers',
      name: region,
      x: weeks,
      y: weeks.map(() => region),
      z: weeks.map((_, w) => 10 ** (1 + k * 0.6 + Math.sin(w / 8 + k) * 0.5)),
      marker: { size: 3 },
      line: { width: 1.5 },
    })),
    layout: {
      title: { text: 'Weekly volume by region' },
      scene: {
        zaxis: { type: 'log', title: { text: 'volume' } },
        camera: { eye: { x: 1.6, y: 1.5, z: 0.8 } },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
