import { createChart } from '@mk7s/holochart';
import { uvSphere } from '../_lib/mesh3d-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * `intensity` per vertex and per cell (plan E14.4): on the left, one value per vertex (the
 * height `z`), interpolated across the triangles and colored per fragment; on the right,
 * `intensitymode: 'cell'`, one value per triangle (its mean height), each triangle one color.
 * Both share `coloraxis`, so one colorbar covers them.
 */
export const meta: ExampleMeta = {
  title: 'Mesh3d: vertex vs cell intensity',
  description: 'Intensity per vertex (interpolated) and per triangle, on a shared color axis.',
  tags: ['mesh3d', '3d', 'mesh', 'intensity', 'colorscale'],
  size: { width: 800, height: 400 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const s = uvSphere(10, 16);
  const cells = s.i.map((a, t) => (s.z[a]! + s.z[s.j[t]!]! + s.z[s.k[t]!]!) / 3);
  const chart = createChart(el, {
    data: [
      { type: 'mesh3d', name: 'vertex', ...s, intensity: s.z, coloraxis: 'coloraxis' },
      {
        type: 'mesh3d',
        name: 'cell',
        scene: 'scene2',
        ...s,
        intensity: cells,
        intensitymode: 'cell',
        coloraxis: 'coloraxis',
      },
    ],
    layout: {
      title: { text: "intensitymode: 'vertex' (left) and 'cell' (right)" },
      scene: { domain: { x: [0, 0.46] } },
      scene2: { domain: { x: [0.46, 0.92] } },
      coloraxis: { colorscale: 'Viridis', colorbar: { title: { text: 'z' } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
