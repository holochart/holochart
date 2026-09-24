import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Text mode (plan E9.3): labels around markers at all nine `textposition`s (one per point, as an
 * array), a `texttemplate` with number and date formats, a multi-line label, per-point
 * `textfont` sizes and colors, and a text-only trace.
 */
export const meta: ExampleMeta = {
  title: 'Scatter: text labels',
  description:
    'All nine textpositions around markers, texttemplate with d3 number/date formats, multi-line labels, per-point fonts and text-only mode.',
  tags: ['scatter', 'text'],
  size: { width: 640, height: 440 },
  testTolerance: 0.006,
};

const POSITIONS = [
  'top left',
  'top center',
  'top right',
  'middle left',
  'middle center',
  'middle right',
  'bottom left',
  'bottom center',
  'bottom right',
];

export function run(el: HTMLElement): ExampleHandle {
  const grid = POSITIONS.map((_, k) => ({ x: (k % 3) * 2, y: 4 - Math.floor(k / 3) * 1.5 }));
  const day = 86_400_000;
  const t0 = Date.UTC(2026, 2, 2);

  const chart = createChart(el, {
    data: [
      {
        name: 'textposition',
        x: grid.map((p) => p.x),
        y: grid.map((p) => p.y),
        mode: 'markers+text',
        text: POSITIONS,
        textposition: POSITIONS,
        marker: { size: 12, color: '#5e74d5' },
      },
      {
        name: 'texttemplate',
        x: [7, 8, 9, 10],
        y: [0.2, 1.4, 0.9, 2.3],
        mode: 'lines+markers+text',
        textposition: 'top center',
        texttemplate: '%{y:.2f} €',
        customdata: [0, 1, 2, 3].map((i) => new Date(t0 + i * 7 * day).toISOString()),
        marker: { size: 7, color: '#ea2a37' },
        line: { color: '#ea2a37' },
        textfont: { size: [9, 11, 13, 15], color: ['#ea2a37', '#9962c0', '#118e36', '#128b8b'] },
      },
      {
        name: 'dates',
        x: [7, 8.5, 10],
        y: [4.2, 3.4, 4.4],
        mode: 'markers+text',
        textposition: 'bottom center',
        texttemplate: '%{customdata|%b %d}',
        customdata: [0, 1, 2].map((i) => new Date(t0 + i * 30 * day).toISOString()),
        marker: { size: 9, symbol: 'diamond', color: '#118e36' },
        textfont: { weight: 'bold', size: 10, color: '#eceef4' },
      },
      {
        name: 'text only',
        x: [2, 4.5],
        y: [-1, -0.6],
        mode: 'text',
        text: ['text-only<br>two lines', 'plain'],
        textfont: { size: 11, color: '#80838f' },
      },
    ],
    layout: {
      showlegend: false,
      // Like Plotly, autorange leaves no room for text; widen x so edge labels are not clipped.
      xaxis: { range: [-1.4, 11] },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
