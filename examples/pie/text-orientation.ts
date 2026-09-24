import { createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Inside text orientation (plan E9.11): the same data four times in a 2×2 `layout.grid`, one per
 * `insidetextorientation`. `'horizontal'` keeps labels level (and small where slices are thin),
 * `'radial'` runs them along the radius, `'tangential'` along the circle, and `'auto'` (the
 * default) picks per slice whichever fits the label largest.
 */
export const meta: ExampleMeta = {
  title: 'Pie: inside text orientation',
  description:
    "insidetextorientation 'horizontal', 'radial', 'tangential' and 'auto' side by side on the same data.",
  tags: ['pie', 'chart', 'text', 'grid'],
  size: { width: 720, height: 640 },
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

const CHARACTERS = "0123456789.%' ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ORIENTATIONS = ['horizontal', 'radial', 'tangential', 'auto'] as const;

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  // Which orientation and size fit is decided from text metrics: measure with the shipped default font
  // (loaded before the chart is created, so the first layout already uses it).
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: ORIENTATIONS.map((orientation, i) => ({
        type: 'pie',
        name: orientation,
        labels: ['Research', 'Engineering', 'Design', 'Support', 'Legal', 'Travel'],
        values: [34, 28, 16, 12, 6, 4],
        textinfo: 'label+percent',
        textposition: 'inside',
        insidetextorientation: orientation,
        domain: { row: Math.floor(i / 2), column: i % 2 },
        title: { text: `'${orientation}'` },
      })),
      layout: {
        grid: { rows: 2, columns: 2 },
        showlegend: false,
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
