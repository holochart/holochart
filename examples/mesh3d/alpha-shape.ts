import { createChart } from '@mk7s/holochart';
import { solidTorus } from '../_lib/mesh3d-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * An alpha shape (plan E14.4): `alphahull: 6` keeps the Delaunay tetrahedra of 900 points inside
 * a torus whose circumradius is below 1/6 (in coordinates scaled to the unit cube per axis, as
 * Plotly) and draws their boundary: unlike the convex hull (`alphahull: 0`), the hole stays open.
 */
export const meta: ExampleMeta = {
  title: 'Mesh3d: alpha shape of a torus (alphahull > 0)',
  description: 'The alpha shape of points filling a torus: a concave surface with its hole kept.',
  tags: ['mesh3d', '3d', 'mesh', 'alpha shape', 'alphahull'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'mesh3d',
        name: 'torus',
        ...solidTorus(900, 2, 0.8),
        alphahull: 6,
        flatshading: true,
      },
    ],
    layout: {
      title: { text: 'Alpha shape (alphahull: 6)' },
      scene: { aspectmode: 'data', camera: { eye: { x: 1.1, y: -1.1, z: 1.3 } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
