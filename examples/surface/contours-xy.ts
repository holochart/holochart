import { createChart } from '@mk7s/holochart';
import { linspace, sample } from '../_lib/surface-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * x and y contours (plan E14.3): lines of constant x and constant y across the surface, at the
 * axis ticks when no `start` / `end` / `size` is given (Plotly's default). `project.x` and
 * `project.y` draw the profiles on the side walls: each x contour becomes a curve of z over y on
 * the x wall, the wall that stays at the back as the camera turns.
 */
export const meta: ExampleMeta = {
  title: 'Surface: x and y contours',
  description: 'Lines of constant x and y across a saddle, projected as profiles onto the walls.',
  tags: ['surface', '3d', 'scientific', 'contour'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const axis = linspace(-2, 2, 41);
  const chart = createChart(el, {
    data: [
      {
        type: 'surface',
        x: axis,
        y: axis,
        z: sample(axis, axis, (x, y) => (x * x - y * y) / 2),
        showscale: false,
        contours: {
          x: { show: true, color: '#f0f0f0', width: 2, project: { x: true } },
          y: { show: true, color: '#ffd166', width: 2, project: { y: true } },
        },
      },
    ],
    layout: {
      title: { text: 'Saddle profiles' },
      scene: { camera: { eye: { x: 1.4, y: 1.5, z: 0.9 } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
