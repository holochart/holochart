import { createChart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * First end-to-end chart (M1 wave 1): `createChart` → defaults → calc → layout (margins, autorange)
 * → scatter markers in one scissored subplot viewport. Colors come from the default colorway;
 * axes are drawn in wave 2, so the plot area shows as `plot_bgcolor`.
 */
export const meta: ExampleMeta = {
  title: 'Chart: basic scatter',
  description:
    'Three seeded clusters through the chart runtime: colorway, marker symbols, sizes, per-point colors and opacity, autorange.',
  tags: ['dev', 'chart', 'scatter', 'runtime'],
};

function cluster(n: number, cx: number, cy: number, spread: number, seed: number) {
  const normal = gaussian(rng(seed));
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = cx + normal() * spread;
    y[i] = cy + normal() * spread;
  }
  return { x, y };
}

export function run(el: HTMLElement): ExampleHandle {
  const a = cluster(150, 2, 3, 0.8, 1);
  const b = cluster(120, 6, 5, 1.1, 2);
  const c = cluster(40, 4.5, 1, 0.5, 3);
  const random = rng(4);
  const cSizes = Array.from({ length: 40 }, () => 8 + random() * 14);
  const cColors = Array.from({ length: 40 }, (_, i) => (i % 3 === 0 ? '#d62728' : '#9467bd'));

  // Vendored Inter: deterministic tick labels and legend text (no CDN font).
  useExampleFonts();
  const chart = createChart(el, {
    data: [
      { type: 'scatter', mode: 'markers', name: 'A', ...a },
      {
        type: 'scatter',
        mode: 'markers',
        name: 'B',
        ...b,
        marker: { symbol: 'diamond', size: 9, opacity: 0.8, line: { width: 1, color: '#ffffff' } },
      },
      {
        type: 'scatter',
        mode: 'markers',
        name: 'C',
        ...c,
        marker: { symbol: 'circle-open', size: cSizes, color: cColors },
      },
    ],
    layout: {
      margin: { l: 48, r: 24, t: 24, b: 40 },
      paper_bgcolor: '#ffffff',
      plot_bgcolor: '#e5ecf6',
    },
    config: { responsive: true },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
