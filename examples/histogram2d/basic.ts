import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A basic 2D histogram (plan E10.2): 4,000 correlated samples binned along x and y with Plotly's
 * automatic bin sizes, counted per cell and drawn as a GPU heatmap (one textured quad). The
 * default look's colorbar sits on the right.
 */
export const meta: ExampleMeta = {
  title: '2D histogram: basic',
  description: 'Correlated samples binned automatically along x and y, counts shown as a heatmap.',
  tags: ['histogram2d', 'statistical', 'heatmap', 'colorscale'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(7));
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < 4000; i++) {
    const a = normal();
    x.push(a);
    y.push(0.6 * a + 0.8 * normal());
  }
  const chart = createChart(el, {
    data: [{ type: 'histogram2d', x, y }],
    layout: {
      title: { text: 'Joint distribution' },
      xaxis: { title: { text: 'x' } },
      yaxis: { title: { text: 'y' } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
