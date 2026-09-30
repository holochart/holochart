import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Lit sphere markers (plan E14.2, a Holochart extension): `marker.render: 'sphere'` draws each
 * marker as a shaded sphere ray-cast on the GPU (exact silhouettes, per-pixel lighting, correct
 * intersections), sized like sprite markers (`marker.size` px, bubble sizes here), colored through
 * a colorscale. One draw call for all spheres.
 */
export const meta: ExampleMeta = {
  title: 'Scatter3D: sphere markers',
  description: 'Bubble-sized, lit sphere markers colored by value (marker.render: sphere).',
  tags: ['scatter3d', '3d', 'markers', 'spheres', 'bubble'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(5);
  const normal = gaussian(random);
  const n = 120;
  const x = Array.from({ length: n }, () => normal());
  const y = Array.from({ length: n }, () => normal());
  const z = Array.from({ length: n }, () => normal());
  const value = x.map((v, i) => Math.hypot(v, y[i]!, z[i]!));
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter3d',
        mode: 'markers',
        x,
        y,
        z,
        marker: {
          render: 'sphere',
          size: value.map((v) => 6 + 6 * v),
          sizemode: 'diameter',
          color: value,
          colorscale: 'Plasma',
          opacity: 1,
          showscale: true,
          colorbar: { title: { text: 'r' } },
        },
      },
    ],
    layout: {
      title: { text: 'Distance from the origin' },
      scene: { camera: { eye: { x: 1.4, y: 1.4, z: 0.9 } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
