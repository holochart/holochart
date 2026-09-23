import { createChart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A shared `layout.coloraxis` (E5.3): two scatter traces on two subplots map their values through
 * one diverging scale (`cmid: 0`) and one domain spanning both traces, so a single colorbar serves
 * both. The bar is shorter than the plot (`len: 0.8`) and top-aligned with it (`y: 1`, `yanchor: top`).
 */
export const meta: ExampleMeta = {
  title: 'Colorbar: coloraxis shared by two traces',
  description:
    'Two subplots colored through one RdBu coloraxis centered on 0; one top-aligned colorbar for both.',
  tags: ['dev', 'chart', 'colorbar', 'coloraxis', 'subplots'],
  size: { width: 760, height: 420 },
  testTolerance: 0.004,
};

function cloud(n: number, seed: number, shift: number) {
  const normal = gaussian(rng(seed));
  const x = Float64Array.from({ length: n }, () => normal());
  const y = Float64Array.from({ length: n }, () => normal());
  const value = Array.from(x, (v, i) => +(v * 2 + (y[i] as number) + shift).toFixed(2));
  return { x, y, value };
}

export function run(el: HTMLElement): ExampleHandle {
  const a = cloud(200, 21, -1.5);
  const b = cloud(200, 22, 2.5);

  useExampleFonts();
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        name: 'before',
        x: a.x,
        y: a.y,
        marker: { size: 8, color: a.value, coloraxis: 'coloraxis' },
      },
      {
        type: 'scatter',
        mode: 'markers',
        name: 'after',
        x: b.x,
        y: b.y,
        xaxis: 'x2',
        yaxis: 'y2',
        marker: { size: 8, symbol: 'diamond', color: b.value, coloraxis: 'coloraxis' },
      },
    ],
    layout: {
      font: { family: 'Inter' },
      showlegend: false,
      margin: { l: 48, r: 24, t: 24, b: 40 },
      plot_bgcolor: '#f4f6fa',
      xaxis: { domain: [0, 0.46] },
      xaxis2: { domain: [0.54, 1], anchor: 'y2' },
      yaxis2: { anchor: 'x2', showticklabels: false },
      coloraxis: {
        colorscale: 'RdBu',
        reversescale: true,
        cmid: 0,
        colorbar: {
          y: 1,
          yanchor: 'top',
          len: 0.8,
          thickness: 18,
          dtick: 2,
          title: { text: 'Δ score' },
        },
      },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
