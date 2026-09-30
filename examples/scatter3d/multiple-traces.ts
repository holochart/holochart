import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Several `scatter3d` traces in one scene (plan E14.2): each cluster is a trace with its colorway
 * color and legend entry (the legend shows each trace's glyph; clicking one hides it), one
 * dashed trajectory runs through them. Hover shows the trace name beside `x`, `y`, `z`.
 */
export const meta: ExampleMeta = {
  title: 'Scatter3D: several traces with a legend',
  description: 'Three clusters and a dashed trajectory, each a trace in the legend.',
  tags: ['scatter3d', '3d', 'legend', 'lines'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(17));
  const cluster = (cx: number, cy: number, cz: number, n: number) => ({
    x: Array.from({ length: n }, () => cx + normal() * 0.5),
    y: Array.from({ length: n }, () => cy + normal() * 0.5),
    z: Array.from({ length: n }, () => cz + normal() * 0.5),
  });
  const path = Array.from({ length: 40 }, (_, i) => i / 39);
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter3d',
        mode: 'markers',
        name: 'alpha',
        marker: { size: 4 },
        ...cluster(0, 0, 0, 120),
      },
      {
        type: 'scatter3d',
        mode: 'markers',
        name: 'beta',
        marker: { size: 4, symbol: 'square' },
        ...cluster(3, 1, 2, 120),
      },
      {
        type: 'scatter3d',
        mode: 'markers',
        name: 'gamma',
        marker: { size: 4, symbol: 'diamond' },
        ...cluster(1, 3, 4, 120),
      },
      {
        type: 'scatter3d',
        mode: 'lines',
        name: 'trajectory',
        x: path.map((s) => 3 * s - 0.5 + Math.sin(s * 6) * 0.3),
        y: path.map((s) => 3 * s * s),
        z: path.map((s) => 4 * s),
        line: { width: 3, dash: 'dash' },
      },
    ],
    layout: {
      title: { text: 'Clusters and a trajectory' },
      scene: { camera: { eye: { x: 1.6, y: -1.1, z: 0.9 } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
