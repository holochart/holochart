import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Lines and markers in 3D (plan E14.2): a helix drawn as a screen-space thick line (`line.width`
 * is CSS px at every depth) colored along its length through a colorscale (`line.color` numbers,
 * interpolated along each segment), with markers at every tenth turn step.
 */
export const meta: ExampleMeta = {
  title: 'Scatter3D: helix (lines and markers)',
  description: 'A helix as a 3D line colored along its length, with markers.',
  tags: ['scatter3d', '3d', 'lines', 'colorscale'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const n = 400;
  const t = Array.from({ length: n }, (_, i) => (i / (n - 1)) * 6 * Math.PI);
  const x = t.map((v) => Math.cos(v));
  const y = t.map((v) => Math.sin(v));
  const z = t.map((v) => v / (2 * Math.PI));
  const every = (a: number[]): number[] => a.filter((_, i) => i % 10 === 0);
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter3d',
        mode: 'lines',
        name: 'helix',
        x,
        y,
        z,
        line: { width: 4, color: t, colorscale: 'Viridis' },
      },
      {
        type: 'scatter3d',
        mode: 'markers',
        name: 'samples',
        x: every(x),
        y: every(y),
        z: every(z),
        marker: { size: 4, symbol: 'diamond' },
      },
    ],
    layout: {
      title: { text: 'Helix' },
      scene: {
        camera: { eye: { x: 1.5, y: -1.5, z: 0.6 } },
        aspectmode: 'manual',
        aspectratio: { x: 1, y: 1, z: 1.2 },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
