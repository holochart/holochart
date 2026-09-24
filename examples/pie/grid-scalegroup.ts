import { createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Pies in a grid with a shared `scalegroup` (plan E9.11): `layout.grid` splits the plot area into
 * cells and each pie picks one with `domain.column`. Pies in the same `scalegroup` get areas
 * proportional to their totals, so the smaller year reads as smaller instead of every pie filling
 * its cell. The legend lists each label once for both pies (they share the default
 * `legendgroup`), so one click hides that label in both.
 */
export const meta: ExampleMeta = {
  title: 'Pie: grid with a shared scalegroup',
  description:
    'Two pies side by side in layout.grid; a shared scalegroup makes their areas proportional to their totals.',
  tags: ['pie', 'chart', 'grid', 'scalegroup', 'domain', 'legend'],
  size: { width: 800, height: 420 },
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

const CHARACTERS = '0123456789.,% ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const CHANNELS = ['Web shop', 'Marketplace', 'Retail', 'Wholesale'];

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  // Inside-label fit decisions depend on text metrics: measure with the shipped default font
  // (loaded before the chart is created, so the first layout already uses it).
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        {
          type: 'pie',
          name: '2024',
          labels: CHANNELS,
          values: [150, 60, 130, 60],
          scalegroup: 'orders',
          domain: { row: 0, column: 0 },
          title: { text: '2024: 400 orders' },
        },
        {
          type: 'pie',
          name: '2025',
          labels: CHANNELS,
          values: [410, 250, 160, 80],
          scalegroup: 'orders',
          domain: { row: 0, column: 1 },
          title: { text: '2025: 900 orders' },
        },
      ],
      layout: {
        showlegend: true,
        grid: { rows: 1, columns: 2 },
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
