import { componentsReady, createChart, type Chart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Axis styling (E3.4): mirrored lines with inside ticks, minor ticks and dotted minor grid, dashed
 * major grid (top left); axes on the top and right sides with rotated labels, custom fonts and
 * title standoff (top right); vertical category labels, and inside tick labels on an axis drawn
 * below the traces (bottom left); an x axis at a free position below its subplot (bottom right).
 *
 * Multicategory dividers are covered by unit tests: scatter cannot plot two-level x data yet.
 */
export const meta: ExampleMeta = {
  title: 'Axes: mirror, minor ticks, rotation, sides, layer, free position',
  description:
    'Axis lines, inside/outside ticks, minor grid, dashes, rotated labels, top/right sides, titles, layer and free axes.',
  tags: ['dev', 'chart', 'axes'],
  size: { width: 860, height: 620 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

async function loadFonts(): Promise<void> {
  useExampleFonts();
  await Promise.all([document.fonts.load('12px Inter'), document.fonts.load('bold 12px Inter')]);
}

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const random = rng(3);

  const n = 30;
  const x1 = Float64Array.from({ length: n }, (_, i) => i * 0.35);
  const y1 = Float64Array.from(x1, (v) => 2 + Math.sin(v) * 1.5 + random() * 0.4);
  const regions = ['North region', 'South region', 'East region', 'West region', 'Central'];
  const sales = regions.map(() => Math.round(200 + random() * 800));
  const groups = ['2024', '2024', '2024', '2025', '2025', '2025'];
  const quarters = ['Q1', 'Q2', 'Q3', 'Q1', 'Q2', 'Q3'];
  const revenue = quarters.map(() => 20 + random() * 60);
  const x4 = Float64Array.from({ length: 20 }, (_, i) => i * 5);
  const y4 = Float64Array.from(x4, (v) => 100 - v + random() * 15);

  const ready = loadFonts().then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        { mode: 'markers', x: x1, y: y1, marker: { color: '#636efa' } },
        {
          mode: 'markers',
          x: regions,
          y: sales,
          xaxis: 'x2',
          yaxis: 'y2',
          marker: { color: '#ef553b', size: 10, symbol: 'diamond' },
        },
        {
          mode: 'markers',
          x: groups.map((g, i) => `${quarters[i]} ${g}`),
          y: revenue,
          xaxis: 'x3',
          yaxis: 'y3',
          marker: { color: '#00cc96', size: 18, opacity: 0.9 },
        },
        {
          mode: 'markers',
          x: x4,
          y: y4,
          xaxis: 'x4',
          yaxis: 'y4',
          marker: { color: '#ab63fa', symbol: 'triangle-up', size: 9 },
        },
      ],
      layout: {
        font: { family: 'Inter', size: 11 },
        showlegend: false,
        margin: { l: 60, r: 70, t: 40, b: 40 },
        xaxis: {
          domain: [0, 0.42],
          anchor: 'y',
          showline: true,
          linewidth: 2,
          linecolor: '#2a3f5f',
          mirror: 'ticks',
          ticks: 'inside',
          ticklen: 7,
          gridcolor: '#c8d1dc',
          griddash: 'dash',
          minor: { ticks: 'inside', ticklen: 4, showgrid: true, griddash: 'dot' },
          zeroline: false,
          title: { text: 'mirrored, inside ticks', standoff: 6 },
        },
        yaxis: {
          domain: [0.6, 1],
          anchor: 'x',
          showline: true,
          linewidth: 2,
          linecolor: '#2a3f5f',
          mirror: 'ticks',
          ticks: 'inside',
          gridcolor: '#c8d1dc',
          minor: { ticks: 'inside', showgrid: true },
          zeroline: false,
        },
        xaxis2: {
          domain: [0.58, 1],
          anchor: 'y2',
          side: 'top',
          automargin: true,
          tickangle: 45,
          ticks: 'outside',
          showline: true,
          tickfont: { color: '#b0413e', size: 11 },
          title: { text: 'side: top, tickangle 45', font: { color: '#b0413e' } },
        },
        yaxis2: {
          domain: [0.6, 1],
          anchor: 'x2',
          side: 'right',
          showline: true,
          mirror: true,
          ticks: 'outside',
          tickprefix: '$',
          title: { text: 'side: right', standoff: 16 },
        },
        xaxis3: {
          domain: [0, 0.42],
          anchor: 'y3',
          showline: true,
          ticks: 'outside',
          tickangle: -90,
          automargin: true,
          title: { text: 'tickangle −90' },
        },
        yaxis3: {
          domain: [0, 0.4],
          anchor: 'x3',
          showline: true,
          linewidth: 3,
          linecolor: '#00a67e',
          layer: 'below traces',
          ticks: 'inside',
          ticklen: 10,
          tickwidth: 2,
          tickcolor: '#00a67e',
          ticklabelposition: 'inside',
          range: [0, 100],
        },
        xaxis4: {
          domain: [0.58, 1],
          anchor: 'free',
          position: 0,
          showline: true,
          ticks: 'outside',
          title: { text: 'anchor: free, position 0' },
        },
        yaxis4: {
          domain: [0.14, 0.4],
          anchor: 'x4',
          showline: true,
          ticks: 'outside',
          tickangle: -30,
          nticks: 4,
        },
      },
    });
    await componentsReady(chart);
  });

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
