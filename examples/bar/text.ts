import { createChart, render, type Chart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Bar labels (plan E9.8): `texttemplate` with d3 formats, `textposition: 'auto'` (inside when the
 * label fits, else past the bar end; inside labels contrast with the fill), `outside`, `inside`
 * with `insidetextanchor: 'middle'`, and horizontal bars with labels at their ends.
 */
export const meta: ExampleMeta = {
  title: 'Bar: text labels',
  description:
    'texttemplate, textposition auto/outside/inside, insidetextanchor and contrast colors on vertical and horizontal bars.',
  tags: ['bar', 'chart', 'text'],
  size: { width: 800, height: 440 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

/**
 * Resolves once the labels are typeset and drawn. Text typesets asynchronously (troika worker) and
 * the chart redraws when it is done, but `chart.ready` only covers the first frame, so wait until
 * frames stop coming (the runtime has no "idle" signal for async primitives yet).
 */
function textReady(chart: Chart, quietMs = 300, maxMs = 15_000): Promise<void> {
  return chart.ready.then(
    () =>
      new Promise<void>((resolve) => {
        const start = performance.now();
        let timer = 0;
        const done = (): void => {
          off();
          resolve();
        };
        const arm = (): void => {
          clearTimeout(timer);
          timer = window.setTimeout(done, performance.now() - start > maxMs ? 0 : quietMs);
        };
        const off = chart.on('afterrender', arm);
        arm();
      }),
  );
}

const { preloadTextFont } = render;
const CHARACTERS = '0123456789.,+-−$%M ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function run(el: HTMLElement): ExampleHandle {
  useExampleFonts();
  let chart: Chart | undefined;
  let disposed = false;
  // Measure labels with the vendored font, not a fallback, so fit decisions are deterministic, and
  // generate its glyphs up front so typesetting is quick.
  const ready = Promise.all([
    document.fonts.load('12px Inter').catch(() => undefined),
    preloadTextFont({ family: 'Inter', characters: CHARACTERS }),
  ]).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        {
          type: 'bar',
          name: 'Revenue',
          x: ['North', 'South', 'East', 'West', 'Central'],
          y: [42.5, 3.2, 27.8, 35.1, 1.4],
          texttemplate: '$%{value:.1f}M',
          textposition: 'auto',
          marker: { color: '#2a3f5f' },
        },
        {
          type: 'bar',
          name: 'Growth',
          x: ['North', 'South', 'East', 'West', 'Central'],
          y: [12, -4, 8, 15, -2],
          texttemplate: '%{value:+d}%',
          textposition: 'outside',
          marker: { color: '#f2c14e' },
        },
        {
          type: 'bar',
          name: 'Share',
          orientation: 'h',
          y: ['A', 'B', 'C'],
          x: [48, 31, 21],
          text: ['Alpha', 'Beta', 'Gamma'],
          textposition: 'inside',
          insidetextanchor: 'middle',
          xaxis: 'x2',
          yaxis: 'y2',
          marker: { color: ['#636efa', '#ef553b', '#00cc96'] },
        },
      ],
      layout: {
        font: { family: 'Inter' },
        margin: { l: 48, r: 24, t: 24, b: 40 },
        paper_bgcolor: '#ffffff',
        plot_bgcolor: '#e5ecf6',
        xaxis: { domain: [0, 0.62] },
        xaxis2: { domain: [0.7, 1], anchor: 'y2' },
        yaxis2: { anchor: 'x2' },
      },
      config: { responsive: true },
    });
    await textReady(chart);
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
