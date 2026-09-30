import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * 3D error bars (plan E14.2): `error_z` from per-point data, `error_x` as a percentage and
 * `error_y` constant, each a segment through its point along its axis (Plotly draws 3D error
 * bars without caps). The scene's autorange includes the bars' ends.
 */
export const meta: ExampleMeta = {
  title: 'Scatter3D: error bars',
  description: 'Measurements with error bars along x (percent), y (constant) and z (data).',
  tags: ['scatter3d', '3d', 'error-bars', 'uncertainty'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(9));
  const n = 16;
  const x = Array.from({ length: n }, (_, i) => 1 + (i % 4));
  const y = Array.from({ length: n }, (_, i) => 1 + Math.floor(i / 4));
  const z = x.map((v, i) => Math.sin(v) + Math.cos(y[i]!) + normal() * 0.1);
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter3d',
        mode: 'markers',
        x,
        y,
        z,
        marker: { size: 5 },
        error_z: { array: z.map((_, i) => 0.15 + (i % 3) * 0.1), thickness: 2 },
        error_x: { type: 'percent', value: 8 },
        error_y: { type: 'constant', value: 0.2, color: '#9962c0' },
      },
    ],
    layout: {
      title: { text: 'Measurements with uncertainty' },
      scene: { camera: { eye: { x: 1.7, y: -1.2, z: 0.8 } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
