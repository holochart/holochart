import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Heatmap coloring (plan E11.2): `contours.coloring: 'heatmap'` draws the grid as a smooth GPU
 * heatmap (bilinear between grid points, Plotly's `zsmooth: 'best'`) under thin, light level lines
 * with their levels written along them, and a continuous colorbar. The field is an interference
 * pattern of two point sources on a coarse 31 × 21 grid.
 */
export const meta: ExampleMeta = {
  title: 'Contour: heatmap coloring',
  description: 'A smooth heatmap under light, labelled level lines: two interfering sources.',
  tags: ['contour', 'scientific', 'heatmap', 'labels'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const x = Array.from({ length: 31 }, (_, i) => i * 0.2);
  const y = Array.from({ length: 21 }, (_, j) => j * 0.2);
  const wave = (px: number, py: number, cx: number, cy: number): number => {
    const r = Math.hypot(px - cx, py - cy);
    return Math.cos(2.2 * r) / (1 + 0.4 * r);
  };
  const z = y.map((py) => x.map((px) => wave(px, py, 1.5, 1.2) + wave(px, py, 4.5, 2.8)));
  const chart = createChart(el, {
    data: [
      {
        type: 'contour',
        x,
        y,
        z,
        ncontours: 10,
        contours: {
          coloring: 'heatmap',
          showlabels: true,
          labelfont: { size: 8, color: '#eceef4' },
        },
        line: { color: 'rgba(236, 238, 244, 0.55)', width: 0.75 },
        colorbar: { title: { text: 'amplitude' } },
      },
    ],
    layout: { title: { text: 'Two sources, heatmap coloring' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
