import { createChart } from '@mk7s/holochart';
import { cubeGrid } from '../_lib/volume-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The space frame (plan E14.8): the distance from the origin on a coarse 9³ grid, its sphere at
 * 0.85 drawn open (`surface.fill: 0.3`; the other surface, at 0, is a point), and the space
 * frame inside it —
 * the central tetrahedron of every grid cell whose values are in `[isomin, isomax]`, its faces
 * drawn as frames (`spaceframe.fill: 0.3`; 0.15 by default) — which shows the grid the field was
 * sampled on.
 */
export const meta: ExampleMeta = {
  title: 'Isosurface: space frame',
  description: 'The lattice of grid cells inside an open sphere.',
  tags: ['isosurface', '3d', 'scientific'],
  testTolerance: 0.006,
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'isosurface',
        ...cubeGrid(9, -1, 1, (x, y, z) => Math.hypot(x, y, z)),
        isomin: 0,
        isomax: 0.85,
        surface: { fill: 0.3 },
        spaceframe: { show: true, fill: 0.3 },
        caps: { x: { show: false }, y: { show: false }, z: { show: false } },
        colorscale: 'Viridis',
      },
    ],
    layout: {
      title: { text: 'Space frame inside an open sphere' },
      scene: { camera: { eye: { x: 1.4, y: -1.4, z: 1 } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
