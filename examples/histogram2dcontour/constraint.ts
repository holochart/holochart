import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Density constraints (plan E11.2, beyond Plotly's histogram2dcontour): the samples are drawn
 * small, and a `contours.type: 'constraint'` density contour with `operation: '>='` shades the
 * region holding at least 0.5% of the samples per bin (`histnorm: 'percent'`), a rough highest-
 * density region, with its boundary as a 2 px line.
 */
export const meta: ExampleMeta = {
  title: '2D density contour: constraint',
  description: 'Samples with the region above a density threshold shaded as a constraint contour.',
  tags: ['histogram2dcontour', 'contour', 'statistical', 'constraint'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(41);
  const normal = gaussian(random);
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < 4000; i++) {
    const b = random() < 0.35;
    const a = normal();
    x.push(b ? 2 + a * 0.6 : a * 1.1);
    y.push(b ? -1 + normal() * 0.5 : 0.6 * a + normal() * 0.7);
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        x,
        y,
        name: 'samples',
        marker: { size: 2, color: 'rgba(236, 238, 244, 0.35)' },
      },
      {
        type: 'histogram2dcontour',
        x,
        y,
        name: '≥ 0.5% per bin',
        histnorm: 'percent',
        xbins: { size: 0.3 },
        ybins: { size: 0.3 },
        contours: { type: 'constraint', operation: '>=', value: 0.5 },
        fillcolor: 'rgba(0, 229, 255, 0.22)',
        line: { color: '#00e5ff' },
        showlegend: true,
      },
    ],
    layout: { title: { text: 'Where the density is above 0.5% per bin' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
