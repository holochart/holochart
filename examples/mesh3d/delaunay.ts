import { createChart } from '@mk7s/holochart';
import { terrain } from '../_lib/mesh3d-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A `mesh3d` from scattered points (plan E14.4): without `i` / `j` / `k`, the default `alphahull:
 * -1` triangulates the points projected along `delaunayaxis` (`z`: their x–y positions) with a
 * Delaunay triangulation — a terrain surface from 300 random samples. `intensity: z` colors it
 * through the automatic colorscale (the layout's diverging ramp: the heights cross zero).
 */
export const meta: ExampleMeta = {
  title: 'Mesh3d: Delaunay terrain from points',
  description: 'A terrain surface triangulated from scattered x–y samples, colored by height.',
  tags: ['mesh3d', '3d', 'mesh', 'delaunay', 'alphahull'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const t = terrain();
  const chart = createChart(el, {
    data: [
      {
        type: 'mesh3d',
        name: 'terrain',
        ...t,
        intensity: t.z,
        colorbar: { title: { text: 'height' } },
      },
    ],
    layout: {
      title: { text: 'Delaunay terrain (alphahull: -1)' },
      scene: { aspectratio: { x: 1, y: 1, z: 0.45 }, camera: { eye: { x: 1.5, y: -1.4, z: 0.9 } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
