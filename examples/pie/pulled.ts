import { createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Pulled slices (plan E9.11): `pull` moves slices out from the center by a fraction of the radius
 * (one number for all, or one per slice) to draw the eye. `textposition: 'outside'` with
 * `textinfo: 'label+percent'` puts the labels around the pie with leader lines, so the legend is
 * not needed. The pie shrinks to leave room for the largest pull.
 */
export const meta: ExampleMeta = {
  title: 'Pie: pulled slices with outside labels',
  description:
    'Per-slice pull to emphasize two slices, clockwise from 90°, with label+percent outside the pie.',
  tags: ['pie', 'chart', 'pull', 'text'],
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

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  // Outside-label placement depends on text metrics: measure with the shipped default font
  // (loaded before the chart is created, so the first layout already uses it).
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        {
          type: 'pie',
          name: 'Support tickets',
          labels: ['Billing', 'Login', 'Bugs', 'Feature requests', 'Shipping', 'Other'],
          values: [340, 210, 180, 120, 95, 55],
          // Pull the two slices the text below the chart talks about.
          pull: [0.12, 0, 0.08, 0, 0, 0],
          rotation: 90,
          direction: 'clockwise',
          textposition: 'outside',
          textinfo: 'label+percent',
        },
      ],
      layout: {
        title: { text: 'Support tickets by topic' },
        showlegend: false,
        // Outside labels need room around the pie.
        margin: { l: 90, r: 90 },
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
