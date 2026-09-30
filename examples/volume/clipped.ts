import { createChart } from '@mk7s/holochart';
import { cubeGrid, gyroid } from '../_lib/volume-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A cutaway (plan E14.7): a ray-marched gyroid lattice (64³ over two periods) whose rays stop at
 * the scene's axis ranges — `scene.xaxis.range` ends at the middle of the grid, so the volume is
 * cut open there and its inside shows. `isomin` / `isomax` keep only the lattice's walls
 * (|gyroid| < 0.35), drawn nearly opaque.
 */
export const meta: ExampleMeta = {
  title: 'Volume: ray-marched cutaway',
  description: 'A gyroid lattice ray-marched and cut open by the scene’s x range.',
  tags: ['volume', '3d', 'scientific', 'raymarch'],
  testTolerance: 0.008,
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'volume',
        ...cubeGrid(64, 0, 4 * Math.PI, gyroid),
        render: 'raymarch',
        isomin: -0.35,
        isomax: 0.35,
        opacity: 0.5,
        colorscale: 'Viridis',
        raymarch: { shading: true },
        lighting: { ambient: 0.4, diffuse: 0.8 },
      },
    ],
    layout: {
      title: { text: 'Gyroid walls, cut at x = 2π' },
      scene: {
        xaxis: { range: [0, 2 * Math.PI] },
        aspectmode: 'cube',
        camera: { eye: { x: 1.6, y: -1.2, z: 0.9 } },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
