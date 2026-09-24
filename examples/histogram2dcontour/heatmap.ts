import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Heatmap coloring (plan E10.3): `contours.coloring: 'heatmap'` draws the bins as a smooth GPU
 * heatmap (bilinear between bin centers) under the level lines, which are thin and light here,
 * with their levels written along them. A three-mode mixture shows several peaks.
 */
export const meta: ExampleMeta = {
  title: '2D density contour: heatmap coloring',
  description: 'A smooth heatmap under light, labelled level lines, for a three-peak mixture.',
  tags: ['histogram2dcontour', 'contour', 'statistical', 'heatmap', 'labels'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(8);
  const normal = gaussian(random);
  const centers = [
    [-1.5, -1],
    [1.2, 1.4],
    [1.8, -1.2],
  ] as const;
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < 6000; i++) {
    const [cx, cy] = centers[Math.floor(random() * 3)]!;
    x.push(cx + normal() * 0.7);
    y.push(cy + normal() * 0.6);
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'histogram2dcontour',
        x,
        y,
        xbins: { size: 0.25 },
        ybins: { size: 0.25 },
        ncontours: 8,
        contours: {
          coloring: 'heatmap',
          showlabels: true,
          labelfont: { size: 8, color: '#eceef4' },
        },
        line: { color: 'rgba(236, 238, 244, 0.55)', width: 0.75 },
        colorbar: { title: { text: 'count' } },
      },
    ],
    layout: { title: { text: 'Three clusters, heatmap coloring' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
