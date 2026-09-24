import { createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Donut (plan E9.11): `hole: 0.5` cuts out the middle and `title.position: 'middle center'` puts
 * the trace title in the hole, a common place for the total. A wider background-colored
 * `marker.line` separates the slices, and `textinfo: 'percent'` keeps the ring labels short.
 */
export const meta: ExampleMeta = {
  title: 'Pie: donut with a centered title',
  description:
    'A donut (hole 0.5) with the total as a title in the hole and gaps between the slices.',
  tags: ['pie', 'donut', 'chart', 'title'],
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
          name: 'Sessions',
          labels: ['Desktop', 'Mobile', 'Tablet', 'Smart TV', 'Other'],
          values: [5820, 4310, 960, 420, 190],
          hole: 0.5,
          textinfo: 'percent',
          marker: { line: { color: '#0a0a0f', width: 2 } },
          title: {
            text: '<b>11,700</b><br>sessions',
            position: 'middle center',
            font: { size: 18 },
          },
        },
      ],
      layout: {
        showlegend: true,
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
