import { createChart } from '@mk7s/holochart';
import { registerScenePoints } from '../_lib/scene-points.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * An orthographic camera (plan E14.1a, `camera.projection.type: 'orthographic'`): parallel lines
 * stay parallel, so the grid reads like a technical drawing. The eye sits low and to the side; the
 * y axis is reversed (`autorange: 'reversed'`). Zooming an orthographic scene scales its
 * `aspectratio`, as in Plotly.
 */
export const meta: ExampleMeta = {
  title: '3D scene: orthographic camera',
  description: 'A surface-like grid of points seen through an orthographic camera, y reversed.',
  tags: ['dev', 'scene', '3d', 'camera', 'orthographic'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  registerScenePoints();
  const x: number[] = [];
  const y: number[] = [];
  const z: number[] = [];
  for (let i = 0; i <= 24; i++) {
    for (let j = 0; j <= 24; j++) {
      const u = -3 + i / 4;
      const v = -3 + j / 4;
      x.push(u);
      y.push(v);
      z.push(Math.sin(u) * Math.cos(v) * 2);
    }
  }
  const chart = createChart(el, {
    data: [{ type: 'scenepoints', x, y, z, size: 3 }],
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
