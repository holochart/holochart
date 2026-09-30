import { createChart } from '@mk7s/holochart';
import { linspace, peaks, sample } from '../_lib/surface-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * `hidesurface` (plan E14.3): the surface itself is not drawn, only its contour lines, here z
 * contours colored by the colorscale: a 3D contour plot floating in the axis box.
 */
export const meta: ExampleMeta = {
  title: 'Surface: contour lines only',
  description: 'A hidden surface drawn only as colored height contours (hidesurface).',
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
        hidesurface: true,
        contours: { z: { show: true, start: -6, end: 8.5, size: 0.5, usecolormap: true } },
      },
    ],
    layout: {
      title: { text: 'Peaks: contour lines in 3D' },
      scene: {
        aspectmode: 'manual',
        aspectratio: { x: 1, y: 1, z: 0.7 },
        camera: { eye: { x: 1.5, y: -1.4, z: 1 } },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
