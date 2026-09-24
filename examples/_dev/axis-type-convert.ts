import { componentsReady, createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Axis type changes convert layout coordinates (Plotly's `convertCoords`): the chart starts on a
 * linear y axis with a fixed range [1, 1000], a data-referenced arrow annotation whose tail is in
 * data units (`axref`/`ayref`), and a layout image centered on a data point. Then
 * `relayout({ 'yaxis.type': 'log' })` runs before `ready`, so the baseline shows the converted
 * state: the range becomes [0, 3] (exponents), the annotation head, its tail and the image keep
 * their data positions (the image height converts with Plotly's sinh/arcsinh size rule).
 */
export const meta: ExampleMeta = {
  title: 'Axes: type change converts coordinates',
  description:
    'A linear axis with a fixed range, a data-unit arrow annotation and a data-referenced image, relayouted to log: everything stays on its data points.',
  tags: ['dev', 'chart', 'axes', 'annotations', 'images'],
  size: { width: 640, height: 400 },
  testTolerance: 0.004,
};

const LOGO = new URL('../_lib/assets/logo.png', import.meta.url).href;

export function run(el: HTMLElement): ExampleHandle {
  const x = Array.from({ length: 21 }, (_, i) => i / 2);
  const y = x.map((v) => 10 ** (0.3 * v));

  const chart = createChart(el, {
    data: [{ type: 'scatter', mode: 'lines+markers', x, y, name: '10^(0.3x)' }],
    layout: {
      showlegend: false,
      xaxis: { range: [-0.5, 10.5] },
      yaxis: { range: [1, 1000] },
      annotations: [
        {
          x: 5,
          y: 10 ** 1.5,
          xref: 'x',
          yref: 'y',
          axref: 'x',
          ayref: 'y',
          ax: 2,
          ay: 300,
          text: 'y = 31.6 (tail at 2, 300)',
        },
        {
          xref: 'paper',
          yref: 'paper',
          x: 0.02,
          y: 0.98,
          xanchor: 'left',
          yanchor: 'top',
          showarrow: false,
          text: "relayout({ 'yaxis.type': 'log' })",
        },
      ],
      images: [
        {
          source: LOGO,
          xref: 'x',
          yref: 'y',
          x: 8,
          y: 10 ** 2.4,
          sizex: 1.6,
          sizey: 200,
          xanchor: 'center',
          yanchor: 'middle',
          sizing: 'stretch',
          opacity: 0.8,
        },
      ],
    },
  });

  const ready = (async () => {
    await chart.ready;
    await chart.relayout({ 'yaxis.type': 'log' });
    await componentsReady(chart);
  })();

  return {
    ready,
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
