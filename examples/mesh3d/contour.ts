import { createChart } from '@mk7s/holochart';
import { terrain } from '../_lib/mesh3d-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The hover contour (plan E14.4): with `contour.show`, hovering the terrain draws the contour
 * line through the hovered point — the level set of `intensity` (here the height) at its value —
 * in `contour.color`, `contour.width` px wide, as Plotly's dynamic contours. Hover the mesh to
 * see it; it goes when the pointer leaves.
 */
export const meta: ExampleMeta = {
  title: 'Mesh3d: hover contour',
  description: 'A terrain that draws the contour line through the hovered point.',
  tags: ['mesh3d', '3d', 'mesh', 'contour', 'hover'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const t = terrain(400, 4);
  const chart = createChart(el, {
    data: [
      {
        type: 'mesh3d',
        name: 'terrain',
        ...t,
        intensity: t.z,
        colorscale: 'Earth',
        contour: { show: true, color: '#ffffff', width: 3 },
        hovertemplate: 'height %{intensity:.2f}<extra></extra>',
      },
    ],
    layout: {
      title: { text: 'Hover to draw the contour through a point' },
      scene: { aspectratio: { x: 1, y: 1, z: 0.45 }, camera: { eye: { x: 1.5, y: -1.4, z: 0.9 } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
