import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A 3D scatter plot (plan E14.2): 600 points of three gaussian clusters as camera-facing markers,
 * colored by `z` through the default look's sequential colorscale, with a colorbar. The markers are
 * one instanced draw call; orbiting only moves the camera. Hover a point for its `x`, `y`, `z`
 * (picked on the GPU), with spikes to the walls.
 */
export const meta: ExampleMeta = {
  title: 'Scatter3D: markers with a colorscale',
  description: 'Three clusters of 3D points colored by z, with a colorbar.',
  tags: ['scatter3d', '3d', 'colorscale', 'markers'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(21));
  const centers = [
    [0, 0, 0],
    [3, 2, 2],
    [-2, 3, 4],
  ] as const;
  const x: number[] = [];
  const y: number[] = [];
  const z: number[] = [];
  for (let i = 0; i < 600; i++) {
    const c = centers[i % 3]!;
    x.push(c[0] + normal() * 0.8);
    y.push(c[1] + normal() * 0.8);
    z.push(c[2] + normal() * 0.8);
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter3d',
        mode: 'markers',
        x,
        y,
        z,
        marker: { size: 5, color: z, showscale: true, colorbar: { title: { text: 'z' } } },
      },
    ],
    layout: {
      title: { text: 'Clusters in 3D' },
      scene: { camera: { eye: { x: 1.6, y: 1.3, z: 0.9 } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
