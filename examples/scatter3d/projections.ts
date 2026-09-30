import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Projections (plan E14.2): `projection.{x, y, z}.show` draws the markers' shadows on the scene's
 * walls (the far walls, which change as the camera turns), at `scale` of the marker size and
 * `opacity`, so the distribution along each pair of axes reads at a glance.
 */
export const meta: ExampleMeta = {
  title: 'Scatter3D: projections on the walls',
  description: 'A point cloud with its shadows projected onto the three walls.',
  tags: ['scatter3d', '3d', 'projection', 'markers'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(13));
  const n = 250;
  const x = Array.from({ length: n }, () => normal());
  const y = x.map((v) => 0.6 * v + normal() * 0.5);
  const z = x.map((v, i) => 0.4 * v - 0.3 * y[i]! + normal() * 0.4);
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter3d',
        mode: 'markers',
        x,
        y,
        z,
        marker: { size: 4, opacity: 0.9 },
        projection: {
          x: { show: true, opacity: 0.4, scale: 0.6 },
          y: { show: true, opacity: 0.4, scale: 0.6 },
          z: { show: true, opacity: 0.4, scale: 0.6 },
        },
      },
    ],
    layout: {
      title: { text: 'Correlated cloud with projections' },
      scene: { camera: { eye: { x: 1.5, y: 1.4, z: 1 } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
