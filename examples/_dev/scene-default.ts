import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import { registerScenePoints } from '../_lib/scene-points.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The 3D scene subplot (plan E14.1a–c) with Plotly's default camera (eye at 1.25, 1.25, 1.25,
 * z up): the axis box on faint far walls, grids and zero lines on the walls, tick labels and
 * titles as billboards beside the lower edges. Drag to turn it (turntable), scroll to zoom,
 * double-click to go back. Drawn with a dev-only point trace until `scatter3d` lands (wave 1).
 */
export const meta: ExampleMeta = {
  title: '3D scene: default camera',
  description:
    'A 3D scene with the default camera and the default look: far walls, grids, tick labels and axis titles.',
  tags: ['dev', 'scene', '3d', 'camera'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  registerScenePoints();
  const random = rng(7);
  const normal = gaussian(random);
  const n = 400;
  const t = Float64Array.from({ length: n }, (_, i) => (i / n) * 6 * Math.PI);
  const chart = createChart(el, {
    data: [
      {
        type: 'scenepoints',
        x: Float64Array.from(t, (v) => 3 * Math.cos(v) + normal() * 0.15),
        y: Float64Array.from(t, (v) => 3 * Math.sin(v) + normal() * 0.15),
        z: Float64Array.from(t, (v) => v / 2 - 4),
        size: 4,
      },
    ],
    layout: { title: { text: 'Helix in the default scene' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
