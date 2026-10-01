import { createChart } from '@mk7s/holochart';
import { linspace, sample } from '../_lib/surface-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * An orthographic camera (plan E14.1a, `camera.projection.type: 'orthographic'`): parallel lines
 * stay parallel, so the grid and the surface read like a technical drawing. The eye sits low and to
 * the side; the y axis is reversed (`autorange: 'reversed'`). Zooming an orthographic scene scales
 * its `aspectratio`, as in Plotly.
 */
export const meta: ExampleMeta = {
  title: '3D scene: orthographic camera',
  description: 'A surface seen through an orthographic camera, with the y axis reversed.',
  tags: ['scene', '3d', 'camera', 'orthographic', 'surface'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const axis = linspace(-3, 3, 25);
  const chart = createChart(el, {
    data: [
      {
        type: 'surface',
        x: axis,
        y: axis,
        z: sample(axis, axis, (u, v) => Math.sin(u) * Math.cos(v) * 2),
        showscale: false,
      },
    ],
    layout: {
      title: { text: 'Orthographic projection' },
      scene: {
        camera: { projection: { type: 'orthographic' }, eye: { x: 1.8, y: 0.9, z: 0.7 } },
        yaxis: { autorange: 'reversed' },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
