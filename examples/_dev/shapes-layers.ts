import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Shape layers (E5.5), Plotly semantics: `below` draws under the grid and the bars, `between`
 * over the grid but under the bars, `above` over the bars. A paper-referenced band with
 * `layer: 'below'` sits under every subplot's grid and extends into the margin.
 */
export const meta: ExampleMeta = {
  title: 'Shapes: layer below / between / above',
  description:
    'Three opaque bands crossing bars and a strong grid: below the grid, between grid and bars, and above the bars; plus a paper band below everything.',
  tags: ['dev', 'chart', 'shapes'],
  size: { width: 680, height: 420 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const band = (y0: number, layer: string, color: string) => ({
    type: 'rect',
    layer,
    xref: 'x domain',
    x0: 0.02,
    x1: 0.98,
    y0,
    y1: y0 + 1.2,
    fillcolor: color,
    line: { width: 0 },
    label: {
      text: layer,
      textposition: 'middle left',
      font: { color: '#ffffff', weight: 'bold' },
    },
  });
  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        x: [1, 2, 3, 4],
        y: [9, 8.5, 9.5, 7.8],
        width: 0.45,
      },
    ],
    layout: {
      showlegend: false,
      margin: { r: 70 }, // room for the paper band that extends into the right margin
      yaxis: { range: [0, 10], dtick: 0.5, gridcolor: '#80838f', gridwidth: 2 },
      xaxis: { range: [-0.7, 4.5], dtick: 1, gridcolor: '#80838f', gridwidth: 2 },
      shapes: [
        band(1, 'below', '#5e74d5'),
        band(4, 'between', '#118e36'),
        band(7, 'above', '#9962c0'),
        // A paper band under everything: visible in the right margin, under the grid inside.
        {
          type: 'rect',
          layer: 'below',
          xref: 'paper',
          yref: 'paper',
          x0: 0.9,
          x1: 1.08,
          y0: 0.05,
          y1: 0.95,
          fillcolor: 'rgba(153, 118, 0, 0.35)',
          line: { color: '#997600', width: 2 },
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
