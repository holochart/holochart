import { componentsReady, createChart, type Chart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
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
  let chart: Chart | undefined;
  let disposed = false;

  const grid = POSITIONS.map((_, k) => ({ x: (k % 3) * 2, y: 4 - Math.floor(k / 3) * 1.5 }));
  const day = 86_400_000;
  const t0 = Date.UTC(2026, 2, 2);

  const ready = (async () => {
    useExampleFonts();
    await Promise.all([document.fonts.load('12px Inter'), document.fonts.load('bold 12px Inter')]);
    if (disposed) return;
    chart = createChart(el, {
      data: [
        {
          name: 'textposition',
          x: grid.map((p) => p.x),
          y: grid.map((p) => p.y),
          mode: 'markers+text',
          text: POSITIONS,
          textposition: POSITIONS,
          marker: { size: 14, color: '#636efa' },
          textfont: { size: 11, color: '#2a3f5f' },
        },
        {
          name: 'texttemplate',
          x: [7, 8, 9, 10],
          y: [0.2, 1.4, 0.9, 2.3],
          mode: 'lines+markers+text',
          textposition: 'top center',
          texttemplate: '%{y:.2f} €',
          customdata: [0, 1, 2, 3].map((i) => new Date(t0 + i * 7 * day).toISOString()),
          marker: { size: 8, color: '#ef553b' },
          line: { color: '#ef553b', width: 1.5 },
          textfont: { size: [10, 12, 14, 16], color: ['#ef553b', '#ab63fa', '#00cc96', '#19d3f3'] },
        },
        {
          name: 'dates',
          x: [7, 8.5, 10],
          y: [4.2, 3.4, 4.4],
          mode: 'markers+text',
          textposition: 'bottom center',
          texttemplate: '%{customdata|%b %d}',
          customdata: [0, 1, 2].map((i) => new Date(t0 + i * 30 * day).toISOString()),
          marker: { size: 10, symbol: 'diamond', color: '#00cc96' },
          textfont: { weight: 'bold', size: 12, color: '#1b7f5e' },
        },
        {
          name: 'text only',
          x: [2, 4.5],
          y: [-1, -0.6],
          mode: 'text',
          text: ['text-only<br>two lines', 'plain'],
          textfont: { size: 13, color: '#7f7f7f' },
        },
      ],
      layout: {
        font: { family: 'Inter', size: 11 },
        showlegend: false,
        margin: { l: 40, r: 20, t: 20, b: 30 },
        // Like Plotly, autorange leaves no room for text; widen x so edge labels are not clipped.
        xaxis: { range: [-1.4, 11] },
        plot_bgcolor: '#f7f9fc',
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
