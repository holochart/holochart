import { createChart } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import { registerScenePoints } from '../_lib/scene-points.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Aspect modes (plan E14.1a) on three scenes side by side (`domain.x`), each with its own camera:
 * the same cloud spans 10 × 4 × 1.5 units. `cube` draws the axes as a cube whatever their ranges,
 * `data` makes each axis as long as its data span (the `auto` default does this unless one axis
 * would be more than 4 times another), and `manual` takes `aspectratio`. The box grows with the
 * ratios while the camera stays put (Plotly), so the last two scenes move their eyes back.
 */
export const meta: ExampleMeta = {
  title: '3D scene: aspect modes',
  description: 'Three scenes with aspectmode cube, data and manual (2 : 1 : 0.5), side by side.',
  tags: ['dev', 'scene', '3d', 'aspect', 'subplots'],
  size: { width: 900, height: 360 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  registerScenePoints();
  const random = rng(11);
  const n = 250;
  const x = Float64Array.from({ length: n }, () => random() * 10);
  const y = Float64Array.from({ length: n }, () => random() * 4);
  const z = Float64Array.from(x, (v, i) => 0.15 * v + 0.2 * (y[i] as number) + random() * 0.3);
  const scenes = ['scene', 'scene2', 'scene3'] as const;
  const chart = createChart(el, {
    data: scenes.map((scene) => ({ type: 'scenepoints', scene, x, y, z, size: 3 })),
    layout: {
      title: { text: 'aspectmode: cube · data · manual (2 : 1 : 0.5)' },
      showlegend: false,
      scene: { domain: { x: [0, 0.33] }, aspectmode: 'cube' },
      scene2: {
        domain: { x: [0.33, 0.67] },
        aspectmode: 'data',
        camera: { eye: { x: 2.2, y: 2.2, z: 1.6 } },
      },
      scene3: {
        domain: { x: [0.67, 1] },
        aspectratio: { x: 2, y: 1, z: 0.5 },
        camera: { eye: { x: 2, y: -2, z: 1.2 } },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
