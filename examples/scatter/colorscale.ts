import { componentsReady, createChart, type Chart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Numeric marker colors (plan E9.1, E9.5): a bubble chart whose `marker.color` numbers map
 * through `Viridis` and whose sizes scale by area (`sizemode: 'area'`, `sizeref`, `sizemin`), and
 * a diverging cloud with `cmid: 0` and the automatic RdBu scale, reversed. The colorbar component
 * arrives in M1 wave 3; only the mapping is drawn here.
 */
export const meta: ExampleMeta = {
  title: 'Scatter: colorscales and bubbles',
  description:
    'Numeric marker.color through Viridis with area-scaled bubbles; a diverging autocolorscale with cmid and reversescale.',
  tags: ['scatter', 'markers', 'colorscale', 'bubble'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const random = rng(31);
  const normal = gaussian(rng(32));

  const n = 40;
  const bx = Float64Array.from({ length: n }, () => random() * 10);
  const by = Float64Array.from({ length: n }, () => 5 + random() * 5);
  const pop = Float64Array.from({ length: n }, () => 5 + random() * 95);
  const growth = Float64Array.from({ length: n }, (_, i) => bx[i]! * 0.8 + random() * 2);

  const m = 300;
  const cx = Float64Array.from({ length: m }, () => 5 + normal() * 2.2);
  const cy = Float64Array.from({ length: m }, () => 2 + normal() * 1);
  const dev = Float64Array.from({ length: m }, (_, i) => (cx[i]! - 5) * 0.6 + normal() * 0.3);

  const ready = (async () => {
    useExampleFonts();
    await document.fonts.load('12px Inter');
    if (disposed) return;
    chart = createChart(el, {
      data: [
        {
          name: 'bubbles',
          x: bx,
          y: by,
          mode: 'markers',
          marker: {
            size: pop,
            sizemode: 'area',
            sizeref: (2 * 100) / 40 ** 2,
            sizemin: 3,
            color: growth,
            colorscale: 'Viridis',
          },
        },
        {
          name: 'diverging',
          x: cx,
          y: cy,
          mode: 'markers',
          marker: { size: 6, color: dev, cmid: 0, reversescale: true },
        },
      ],
      layout: {
        font: { family: 'Inter', size: 11 },
        margin: { l: 40, r: 20, t: 20, b: 30 },
        plot_bgcolor: '#e5ecf6',
      },
    });
    await componentsReady(chart);
  })();

  return {
    ready,
    get renderer() {
      return chart?.three.renderer;
    },
    dispose: () => {
      disposed = true;
      chart?.destroy();
    },
  };
}
