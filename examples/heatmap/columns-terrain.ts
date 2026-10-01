import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A large heatmap as columns (plan E8.9): 200 × 200 cells — 40,000 columns in one draw call —
 * as a terrain in a tilted view. Heights follow the values from the color range's `zmin: 0`
 * (lower values stay on the floor) to `depth`, 120 px, at `zmax`; without gaps the columns form a
 * stepped surface. Building the columns takes about 0.2 s; grids above 100,000 cells stay flat.
 */
export const meta: ExampleMeta = {
  title: 'Heatmap: 40,000 columns (depth)',
  description:
    'A 200×200 heatmap drawn as 40,000 columns forming a stepped terrain in a tilted view.',
  tags: ['heatmap', 'scientific', 'depth', '2.5d', 'view3d', 'performance', 'holochart-extension'],
  size: { width: 640, height: 480 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const n = 200;
  const z: number[][] = [];
  for (let j = 0; j < n; j++) {
    const row: number[] = [];
    const y = (j / n) * 6 - 3;
    for (let i = 0; i < n; i++) {
      const x = (i / n) * 6 - 3;
      row.push(
        3 * (1 - x) ** 2 * Math.exp(-(x ** 2) - (y + 1) ** 2) -
          10 * (x / 5 - x ** 3 - y ** 5) * Math.exp(-(x ** 2) - y ** 2) -
          Math.exp(-((x + 1) ** 2) - y ** 2) / 3,
      );
    }
    z.push(row);
  }
  const chart = createChart(el, {
    data: [
      { type: 'heatmap', z, zmin: 0, zmax: 8, colorscale: 'Viridis', depth: 120, showscale: false },
    ],
    layout: {
      title: { text: 'Peaks, 200 × 200 columns' },
      xaxis: { visible: false },
      yaxis: { visible: false },
      view3d: { enabled: true, tilt: 40, rotation: -25 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
