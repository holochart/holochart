import { createChart } from '@mk7s/holochart';
import { linspace, peaks, sample } from '../_lib/surface-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * z contours with a projection (plan E14.3): `contours.z` draws lines of constant height on the
 * surface (in the shader: exact and `width` px wide at any zoom), colored by the colorscale
 * (`usecolormap`), and `project.z` draws them again on the floor of the axis box, a contour map
 * under the surface. Levels come from `start`, `end` and `size` (Plotly's, `end` excluded).
 */
export const meta: ExampleMeta = {
  title: 'Surface: z contours and projection',
  description: 'Height contours on the surface and projected onto the floor as a contour map.',
  tags: ['surface', '3d', 'scientific', 'contour'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const axis = linspace(-3, 3, 60);
  const chart = createChart(el, {
    data: [
      {
        type: 'surface',
        x: axis,
        y: axis,
        z: sample(axis, axis, peaks),
        contours: {
          z: {
            show: true,
            start: -6,
            end: 8.5,
            size: 1,
            usecolormap: true,
            project: { z: true },
          },
        },
      },
    ],
    layout: {
      title: { text: 'Peaks with contours' },
      scene: {
        aspectmode: 'manual',
        aspectratio: { x: 1, y: 1, z: 0.8 },
        // Room below the surface for the contour map on the floor.
        zaxis: { range: [-18, 9] },
        camera: { eye: { x: 1.6, y: -1.5, z: 0.5 } },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
