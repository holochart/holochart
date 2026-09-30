import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import { registerScenePoints } from '../_lib/scene-points.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Auto-rotation (plan E7.5), frozen: `scene.autorotate` turns the scene at `speed` degrees per
 * second about `axis`; `time: 3` freezes it 3 s in, so this frame is the layout camera (Plotly's
 * default) turned 90° counterclockwise about z. Without `time` the scene spins while the chart is
 * on screen (see `_dev/interaction-scene-animation`). Drawn with a dev-only point trace until
 * `scatter3d` lands.
 */
export const meta: ExampleMeta = {
  title: '3D scene: auto-rotation (frozen)',
  description:
    'scene.autorotate frozen at autorotate.time: the default camera turned 90° about z, a fixed frame for exports and tests.',
  tags: ['dev', 'scene', '3d', 'camera', 'animation'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  registerScenePoints();
  const random = rng(11);
  const normal = gaussian(random);
  const n = 300;
  const chart = createChart(el, {
    data: [
      {
        type: 'scenepoints',
        x: Float64Array.from({ length: n }, () => 2 + normal() * 0.6),
        y: Float64Array.from({ length: n }, () => normal() * 0.4),
        z: Float64Array.from({ length: n }, () => normal() * 0.3),
        size: 4,
      },
    ],
    layout: {
      title: { text: 'The default view turned 90° about z (frozen 3 s in)' },
      scene: {
        xaxis: { range: [-3, 3] },
        yaxis: { range: [-3, 3] },
        zaxis: { range: [-1.5, 1.5] },
        autorotate: { speed: 30, axis: 'z', time: 3 },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
