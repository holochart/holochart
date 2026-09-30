import { createChart } from '@mk7s/holochart';
import { cloud } from '../_lib/mesh3d-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The convex hull of a point cloud (plan E14.4): `alphahull: 0` wraps 80 Gaussian points in their
 * convex hull; points inside it are left out. Flat shading shows the hull's facets, and
 * `opacity: 0.6` draws it translucent (triangles sorted back to front).
 */
export const meta: ExampleMeta = {
  title: 'Mesh3d: convex hull (alphahull: 0)',
  description: 'The convex hull of 80 random points, flat shaded and translucent.',
  tags: ['mesh3d', '3d', 'mesh', 'convex hull', 'alphahull'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'mesh3d',
        name: 'hull',
        ...cloud(80, [1.5, 1, 0.8]),
        alphahull: 0,
        flatshading: true,
        opacity: 0.6,
      },
    ],
    layout: { title: { text: 'Convex hull (alphahull: 0)' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
