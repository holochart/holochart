import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * 3D lines as tubes (plan E14.10, a Holochart extension): a helix drawn with `line.render:
 * 'tube'`, a lit mesh around the line whose `radius` is a fraction of the axis box (so the tube
 * stays round on any aspect ratio and scales with the view, unlike the px-wide `'screen'` lines).
 * The frames around the curve are carried along without twisting (parallel transport), and the
 * colorscale colors the tube along its length. A second, thinner tube with a `material` of type
 * `'standard'` winds around the first.
 */
export const meta: ExampleMeta = {
  title: 'Scatter3D: tubes (line.render)',
  description: 'A helix drawn as a lit tube colored along its length, and a thin metallic tube.',
  tags: ['scatter3d', '3d', 'lines', 'tube', 'holochart-extension'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const n = 300;
  const t = Array.from({ length: n }, (_, i) => (i / (n - 1)) * 4 * Math.PI);
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter3d',
        mode: 'lines',
        name: 'helix',
        x: t.map((v) => Math.cos(v)),
        y: t.map((v) => Math.sin(v)),
        z: t.map((v) => v / (2 * Math.PI)),
        line: { render: 'tube', radius: 0.035, color: t, colorscale: 'Viridis' },
      },
      {
        type: 'scatter3d',
        mode: 'lines',
        name: 'winding',
        x: t.map((v) => Math.cos(v) + 0.3 * Math.cos(6 * v)),
        y: t.map((v) => Math.sin(v) + 0.3 * Math.sin(6 * v)),
        z: t.map((v) => v / (2 * Math.PI) + 0.1 * Math.sin(3 * v)),
        line: {
          render: 'tube',
          radius: 0.012,
          color: '#d7dbe6',
          material: { type: 'standard', metalness: 0.7, roughness: 0.3 },
        },
      },
    ],
    layout: {
      title: { text: 'Tubes' },
      scene: {
        camera: { eye: { x: 1.5, y: -1.4, z: 0.7 } },
        aspectmode: 'manual',
        aspectratio: { x: 1, y: 1, z: 1 },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
