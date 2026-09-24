import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Background images (E5.6): a picture stretched over the plot area in data coordinates with
 * `layer: 'below'` (under the grid and the traces, clipped to the subplot, following zoom), and a
 * logo `above` the traces anchored to a data point with `xanchor: 'center'`, `yanchor: 'middle'`.
 */
export const meta: ExampleMeta = {
  title: 'Images: background below traces',
  description:
    'A terrain picture under the grid and traces in data coordinates, a logo above the traces centered on a point.',
  tags: ['dev', 'chart', 'images'],
  size: { width: 640, height: 400 },
  testTolerance: 0.004,
};

const TERRAIN = new URL('../_lib/assets/terrain.png', import.meta.url).href;
const LOGO = new URL('../_lib/assets/logo.png', import.meta.url).href;

export function run(el: HTMLElement): ExampleHandle {
  const t = Array.from({ length: 40 }, (_, i) => i / 3);
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines+markers',
        x: t.map((v) => 1 + v * 0.62),
        y: t.map((v) => 3 + 2.2 * Math.sin(v * 0.8) + v * 0.15),
        line: { width: 3 },
        marker: { size: 6 },
      },
    ],
    layout: {
      showlegend: false,
      xaxis: { range: [0, 10], gridcolor: 'rgba(0,0,0,0.25)' },
      yaxis: { range: [0, 8], gridcolor: 'rgba(0,0,0,0.25)' },
      images: [
        {
          source: TERRAIN,
          xref: 'x',
          yref: 'y',
          x: 0,
          y: 8,
          sizex: 10,
          sizey: 8,
          sizing: 'stretch',
          layer: 'below',
        },
        {
          source: LOGO,
          xref: 'x',
          yref: 'y',
          x: 7,
          y: 1.5,
          sizex: 3,
          sizey: 1.5,
          xanchor: 'center',
          yanchor: 'middle',
        },
      ],
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
