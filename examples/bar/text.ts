import { createChart, render, type Chart } from '@mk7s/holochart';
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
  let chart: Chart | undefined;
  let disposed = false;
  // Load the shipped default font before the first layout, so labels are measured with it, not a
  // fallback (fit decisions are deterministic), and generate its glyphs up front.
  const ready = preloadTextFont({ characters: CHARACTERS }).then(async () => {
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
        },
        {
          type: 'bar',
          name: 'Growth',
          x: ['North', 'South', 'East', 'West', 'Central'],
          y: [12, -4, 8, 15, -2],
          texttemplate: '%{value:+d}%',
          textposition: 'outside',
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
          // A light fill in the middle: its inside label switches to dark text.
          marker: { color: ['#9962c0', '#f2c14e', '#128b8b'] },
        },
      ],
      layout: {
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
