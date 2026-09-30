import { createChart } from '@mk7s/holochart';
import { ICOSAHEDRON } from '../_lib/mesh3d-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A `mesh3d` from explicit triangles (plan E14.4): the 12 vertices of an icosahedron in `x`, `y`,
 * `z` and its 20 faces in `i`, `j`, `k` (indices into the vertex arrays). One color (the trace's
 * colorway color), smooth shading with Plotly's lighting model.
 */
export const meta: ExampleMeta = {
  title: 'Mesh3d: icosahedron from i, j, k',
  description: 'An icosahedron drawn from its vertices and explicit triangle indices.',
  tags: ['mesh3d', '3d', 'mesh'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [{ type: 'mesh3d', name: 'icosahedron', ...ICOSAHEDRON }],
    layout: { title: { text: 'Icosahedron' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
