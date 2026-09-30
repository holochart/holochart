import { createChart } from '@mk7s/holochart';
import { vortex } from '../_lib/mesh3d-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A `cone` vector field (plan E14.5): a vortex sampled on a 7 × 7 × 3 grid, `(u, v, w) =
 * (−y, x, 0.4 + 0.2 z)`. Each cone sits at its position (`anchor: 'cm'`, the center of mass),
 * points along its vector and is sized and colored by the vector's norm (`sizemode: 'scaled'`:
 * the cones fit between neighbouring grid points). All cones are one instanced draw call.
 */
export const meta: ExampleMeta = {
  title: 'Cone: a vortex field',
  description: 'Cones on a grid showing a vortex, sized and colored by the vector norm.',
  tags: ['cone', '3d', 'vector field'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [{ type: 'cone', name: 'vortex', ...vortex(), colorbar: { title: { text: 'norm' } } }],
    layout: {
      title: { text: 'Vortex' },
      scene: { camera: { eye: { x: 1.3, y: -1.5, z: 1.1 } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
