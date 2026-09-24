import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Recipe: a scatter with a density contour overlay (plan E10.3). The points are drawn small and
 * translucent; a `histogram2dcontour` over the same data draws plain level lines
 * (`coloring: 'none'`, one color) that stay readable where points pile up. Contours draw below
 * scatter traces (Plotly's layer order), so the overlay is listed second only for the legend.
 */
export const meta: ExampleMeta = {
  title: '2D density contour: over a scatter',
  description: 'Scatter points with density contour lines of the same samples overlaid.',
  tags: ['histogram2dcontour', 'contour', 'scatter', 'recipe', 'statistical'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(41));
  const height: number[] = [];
  const weight: number[] = [];
  for (let i = 0; i < 1500; i++) {
    const h = 172 + normal() * 8;
    height.push(h);
    weight.push(0.9 * (h - 100) + normal() * 7);
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        name: 'people',
        x: height,
        y: weight,
        marker: { size: 3, opacity: 0.45 },
      },
      {
        type: 'histogram2dcontour',
        name: 'density',
        x: height,
        y: weight,
        ncontours: 8,
        contours: { coloring: 'none' },
        line: { color: '#f9f871', width: 1 },
      },
    ],
    layout: {
      title: { text: 'Height and weight' },
      xaxis: { title: { text: 'height (cm)' } },
      yaxis: { title: { text: 'weight (kg)' } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
