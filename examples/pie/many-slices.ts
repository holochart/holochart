import { createChart, render, type Chart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Many slices (plan E9.11): 20 slices with a long tail of tiny values, labeled outside on one
 * line each. The small slices bunch up at the end of the sort order, so their labels would
 * overlap; outside labels are spread apart vertically on each side of the pie and joined to their
 * slices by leader lines (automatic collision avoidance), like Plotly. (When a side has more
 * labels than fit in the figure height they still overlap, as in Plotly.)
 */
export const meta: ExampleMeta = {
  title: 'Pie: many slices with leader lines',
  description:
    '20 slices with a long tail, labeled outside; overlapping labels are spread apart with leader lines.',
  tags: ['pie', 'chart', 'text', 'leader-lines'],
  size: { width: 760, height: 560 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

/**
 * Resolves once the labels are typeset and drawn. Text typesets asynchronously and the chart
 * redraws when it is done, but `chart.ready` only covers the first frame, so wait until frames
 * stop coming.
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

const CHARACTERS = '0123456789.% ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const CITIES = [
  'Tokyo',
  'Delhi',
  'Shanghai',
  'Cairo',
  'Mumbai',
  'Beijing',
  'Dhaka',
  'Osaka',
  'Karachi',
  'Lagos',
  'Istanbul',
  'Manila',
  'Lima',
  'Bogota',
  'Jakarta',
  'Seoul',
  'Nagoya',
  'London',
  'Tehran',
  'Chennai',
];

export function run(el: HTMLElement): ExampleHandle {
  // A Zipf-like long tail with a little seeded noise: deterministic for the visual test.
  const random = rng(911);
  const values = CITIES.map((_, i) => Math.round((4000 / (i + 1) ** 1.4) * (0.9 + 0.2 * random())));

  useExampleFonts();
  let chart: Chart | undefined;
  let disposed = false;
  // Label placement depends on text metrics: measure with the vendored font.
  const ready = Promise.all([
    document.fonts.load('11px Inter').catch(() => undefined),
    render.preloadTextFont({ family: 'Inter', characters: CHARACTERS }),
  ]).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        {
          type: 'pie',
          name: 'Visitors',
          labels: CITIES,
          values,
          direction: 'clockwise',
          textposition: 'outside',
          texttemplate: '%{label} %{percent}',
          textfont: { size: 11 },
          marker: { line: { color: '#ffffff', width: 1 } },
        },
      ],
      layout: {
        font: { family: 'Inter' },
        // Left-aligned, so the stacked labels of the tail (top center) stay clear of it.
        title: { text: 'Visitors by city', x: 0.03, xanchor: 'left' },
        showlegend: false,
        // Outside labels and their leader lines need room on both sides.
        margin: { l: 120, r: 120, t: 72, b: 48 },
        paper_bgcolor: '#ffffff',
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
