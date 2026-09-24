import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Annotation references (E5.4): data-anchored callouts with arrows on a line chart (default pixel
 * tails and a tail given in data units with `axref`/`ayref`), paper-anchored corner notes without
 * arrows whose `auto` anchors pick the side by thirds, a note in the second axis' `domain`, boxes
 * with background, border and padding, and `xshift`/`yshift`.
 */
export const meta: ExampleMeta = {
  title: 'Annotations: data, paper and domain references',
  description:
    'Arrow callouts anchored to data points, paper-corner notes with auto anchors, a domain-referenced label and boxed text.',
  tags: ['dev', 'chart', 'annotations'],
  size: { width: 760, height: 440 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const x = Array.from({ length: 13 }, (_, i) => i);
  const y = [3, 4, 3.5, 5, 7.5, 7, 6, 8.5, 9, 7, 5.5, 6.5, 8];

  const chart = createChart(el, {
    data: [
      { type: 'scatter', mode: 'lines+markers', x, y, name: 'sales' },
      {
        type: 'bar',
        x: ['A', 'B', 'C'],
        y: [4, 7, 5],
        xaxis: 'x2',
        yaxis: 'y2',
      },
    ],
    layout: {
      showlegend: false,
      // Room above the plot for the peak's label and the paper-referenced heading (annotations
      // never grow the margins, as in Plotly).
      margin: { t: 42 },
      xaxis: { domain: [0, 0.64] },
      xaxis2: { domain: [0.72, 1], anchor: 'y2' },
      yaxis2: { anchor: 'x2' },
      annotations: [
        { x: 8, y: 9, text: 'Peak (9.0)' },
        {
          x: 2,
          y: 3.5,
          text: 'Dip',
          ax: 20,
          ay: 40,
          arrowcolor: '#ff9e00',
          font: { color: '#ff9e00' },
        },
        {
          x: 10,
          y: 5.5,
          axref: 'x',
          ayref: 'y',
          ax: 11.5,
          ay: 3.2,
          text: 'tail in data units',
          bgcolor: '#15151d',
          bordercolor: '#5e74d5',
          borderwidth: 1,
          borderpad: 4,
        },
        {
          x: 4,
          y: 7.5,
          text: 'shifted',
          showarrow: false,
          yshift: 14,
          xshift: -8,
        },
        { xref: 'paper', yref: 'paper', x: 0, y: 1, text: 'top-left (paper)', showarrow: false },
        {
          xref: 'paper',
          yref: 'paper',
          x: 1,
          y: 0,
          text: 'bottom-right (paper)',
          showarrow: false,
          bgcolor: 'rgba(153, 118, 0, 0.2)',
          bordercolor: '#997600',
        },
        {
          xref: 'x2 domain',
          yref: 'y2 domain',
          x: 0.5,
          y: 1,
          yanchor: 'bottom',
          text: '<b>by segment</b>',
          showarrow: false,
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
