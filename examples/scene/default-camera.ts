import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The 3D scene subplot (plan E14.1a–c) with nothing set: Plotly's default camera (eye at 1.25,
 * 1.25, 1.25, z up) and the default look — the axis box on faint far walls, grids and zero lines
 * on the walls, tick labels and titles as billboards beside the lower edges. A noisy helix of
 * `scatter3d` markers fills it. Drag to turn it (turntable), scroll to zoom, double-click to go
 * back.
 */
export const meta: ExampleMeta = {
  title: '3D scene: default camera',
  description:
    'A 3D scene with the default camera and the default look: far walls, grids, tick labels and axis titles.',
  tags: ['scene', '3d', 'camera', 'scatter3d'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(7));
  const n = 400;
  const t = Array.from({ length: n }, (_, i) => (i / n) * 6 * Math.PI);
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter3d',
        mode: 'markers',
        x: t.map((v) => 3 * Math.cos(v) + normal() * 0.15),
        y: t.map((v) => 3 * Math.sin(v) + normal() * 0.15),
        z: t.map((v) => v / 2 - 4),
        marker: { size: 3 },
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
