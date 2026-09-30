import { createChart } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import { registerScenePoints } from '../_lib/scene-points.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * 3D axis types (plan E14.1b): a log x axis (`type: 'log'`), and a date y axis and a category z
 * axis detected from the data like cartesian axes. Tick values come from core's
 * `computeTicks` on each axis' range, about one per 40 px of the axis on screen.
 */
export const meta: ExampleMeta = {
  title: '3D scene: log, date and category axes',
  description: 'A scene with a log x axis, a date y axis and a category z axis.',
  tags: ['dev', 'scene', '3d', 'log', 'date', 'category'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  registerScenePoints();
  const random = rng(5);
  const levels = ['low', 'medium', 'high', 'critical'];
  const n = 160;
  const x = Array.from({ length: n }, () => 10 ** (random() * 4));
  const y = Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2024, 0, 1) + (i / n) * 365 * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const z = Array.from(
    { length: n },
    (_, i) => levels[Math.min(3, Math.floor((i / n) * 4 + random() * 0.6))],
  );
  const chart = createChart(el, {
    data: [{ type: 'scenepoints', x, y, z, size: 4 }],
    layout: {
      title: { text: 'log · date · category' },
      scene: {
        xaxis: { type: 'log', title: { text: 'load (log)' } },
        yaxis: { title: { text: 'day' } },
        zaxis: { title: { text: 'severity' } },
        camera: { eye: { x: 1.5, y: -1.5, z: 1 } },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
