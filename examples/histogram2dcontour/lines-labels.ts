import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Labelled contour lines (plan E10.3): `contours.coloring: 'lines'` colors each level's line from
 * the colorscale, and `showlabels` writes the level along the lines (`labelformat`), breaking the
 * line under each label. Levels are explicit (`contours.start` / `end` / `size`), lines are 1.5 px
 * and smoothed (`line.smoothing`).
 */
export const meta: ExampleMeta = {
  title: '2D density contour: lines with labels',
  description: 'Contour lines colored by level with level labels along them, at explicit levels.',
  tags: ['histogram2dcontour', 'contour', 'statistical', 'labels'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(29));
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < 6000; i++) {
    const a = normal();
    x.push(a * 1.3);
    y.push(0.5 * a + normal() * 0.8);
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'histogram2dcontour',
        x,
        y,
        histnorm: 'percent',
        xbins: { size: 0.4 },
        ybins: { size: 0.4 },
        contours: {
          coloring: 'lines',
          start: 0.1,
          end: 1.3,
          size: 0.2,
          showlabels: true,
          labelformat: '.1f',
          labelfont: { size: 8, color: '#eceef4' },
        },
        line: { width: 1.5, smoothing: 1.1 },
        colorbar: { title: { text: '% of samples' } },
      },
    ],
    layout: { title: { text: 'Share of samples per bin (%)' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
