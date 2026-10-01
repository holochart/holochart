import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Heatmap cells as columns (plan E8.9): with `depth` every cell stands up as a column as tall as
 * its value — here 120 px at the top of the color range — colored like the cell, the gaps
 * (`xgap` / `ygap`) between them, like a 3D histogram or a city seen from above at an angle
 * (`layout.view3d`). The flat heatmap stays under the columns as their floor.
 */
export const meta: ExampleMeta = {
  title: 'Heatmap: cells as columns (depth, 2.5D view)',
  description:
    'A 16×16 grid of counts drawn as columns as tall as their values, with gaps, in a tilted and turned view.',
  tags: ['heatmap', 'scientific', 'depth', '2.5d', 'view3d', '3d-native', 'holochart-extension'],
  size: { width: 640, height: 480 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  // Two overlapping "districts" of counts on a 16×16 grid (closed form, deterministic).
  const n = 16;
  const z: number[][] = [];
  for (let j = 0; j < n; j++) {
    const row: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = Math.exp(-((i - 4.5) ** 2 + (j - 10) ** 2) / 10);
      const b = Math.exp(-((i - 11) ** 2 + (j - 5) ** 2) / 16);
      row.push(Math.round(90 * a + 60 * b + 6 * (((i * 7 + j * 3) % 5) / 4)));
    }
    z.push(row);
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'heatmap',
        z,
        colorscale: 'Viridis',
        xgap: 3,
        ygap: 3,
        depth: 120,
        colorbar: { title: { text: 'Count' } },
      },
    ],
    layout: {
      title: { text: 'Counts per block' },
      xaxis: { title: { text: 'East' } },
      yaxis: { title: { text: 'North' } },
      view3d: { enabled: true, tilt: 40, rotation: -30 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
