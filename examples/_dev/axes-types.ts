import { componentsReady, createChart, type Chart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Axis rendering (E3.4) for every axis type in a 2×2 grid of subplots: linear (with a zero line and
 * axis titles), log (major and "2, 5" minor labels), date (two-level labels) and category. Grid
 * lines sit under the markers; lines, ticks and labels above. Automargin (E4.2) grows the left and
 * bottom margins to fit the tick labels and titles.
 */
export const meta: ExampleMeta = {
  title: 'Axes: linear, log, date and category',
  description:
    'Four subplots, one per axis type: ticks, labels, grid, zero line, titles and automargin.',
  tags: ['dev', 'chart', 'axes'],
  size: { width: 800, height: 560 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

/** Load the vendored Inter faces before layout measures text (the canvas oracle needs them). */
async function loadFonts(): Promise<void> {
  useExampleFonts();
  await Promise.all([document.fonts.load('12px Inter'), document.fonts.load('bold 12px Inter')]);
}

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const random = rng(7);

  const n = 40;
  const x = Float64Array.from({ length: n }, (_, i) => i - 12);
  const y = Float64Array.from(x, (v) => 0.02 * v * v * v - 0.4 * v + (random() - 0.5) * 8);
  const logX = Float64Array.from({ length: n }, (_, i) => i + 1);
  const logY = Float64Array.from(logX, (v) => 3 * 10 ** (v / 9) * (0.8 + random() * 0.4));
  const day = 86_400_000;
  const t0 = Date.UTC(2025, 11, 20);
  const dates = Array.from({ length: n }, (_, i) => new Date(t0 + i * day).toISOString());
  const dateY = Float64Array.from(
    { length: n },
    (_, i) => 50 + 10 * Math.sin(i / 5) + random() * 4,
  );
  const fruits = ['Apples', 'Bananas', 'Cherries', 'Dates', 'Elderberries', 'Figs'];
  const fruitY = fruits.map(() => Math.round(10 + random() * 90));

  const ready = loadFonts().then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        { mode: 'markers', x, y, name: 'linear' },
        { mode: 'markers', x: logX, y: logY, xaxis: 'x2', yaxis: 'y2', name: 'log' },
        { mode: 'markers', x: dates, y: dateY, xaxis: 'x3', yaxis: 'y3', name: 'date' },
        {
          mode: 'markers',
          x: fruits,
          y: fruitY,
          xaxis: 'x4',
          yaxis: 'y4',
          name: 'category',
          marker: { size: 10, symbol: 'square' },
        },
      ],
      layout: {
        font: { family: 'Inter', size: 11 },
        showlegend: false,
        margin: { l: 20, r: 20, t: 20, b: 20 },
        plot_bgcolor: '#f7f9fc',
        xaxis: {
          domain: [0, 0.44],
          anchor: 'y',
          title: { text: 'x (linear)' },
          automargin: true,
          showline: true,
          ticks: 'outside',
        },
        yaxis: {
          domain: [0.58, 1],
          anchor: 'x',
          title: { text: 'f(x)' },
          automargin: true,
          showline: true,
          ticks: 'outside',
        },
        xaxis2: { domain: [0.56, 1], anchor: 'y2', title: { text: 'n' }, showline: true },
        yaxis2: {
          domain: [0.58, 1],
          anchor: 'x2',
          type: 'log',
          title: { text: 'growth (log)' },
          showline: true,
          ticks: 'outside',
        },
        xaxis3: {
          domain: [0, 0.44],
          anchor: 'y3',
          automargin: true,
          showline: true,
          ticks: 'outside',
        },
        yaxis3: { domain: [0, 0.42], anchor: 'x3', automargin: true, title: { text: 'level' } },
        xaxis4: { domain: [0.56, 1], anchor: 'y4', automargin: true, showline: true },
        yaxis4: { domain: [0, 0.42], anchor: 'x4', showline: true, ticks: 'outside' },
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
