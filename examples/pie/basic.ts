import { createChart, render, type Chart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Basic pie (plan E9.11): `labels` and `values`, one slice per label. With the defaults
 * (`sort: true`, `direction: 'counterclockwise'`, `rotation: 0`) the largest slice starts at
 * 12 o'clock, slices take the `piecolorway` colors in order, and the legend lists one item per
 * label (click one to hide that slice).
 */
export const meta: ExampleMeta = {
  title: 'Pie: basic',
  description: 'Six slices from labels and values with percent labels and a per-label legend.',
  tags: ['pie', 'chart', 'basic', 'legend'],
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

/**
 * Resolves once the slice labels are typeset and drawn. Text typesets asynchronously and the
 * chart redraws when it is done, but `chart.ready` only covers the first frame, so wait until
 * frames stop coming.
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
  useExampleFonts();
  let chart: Chart | undefined;
  let disposed = false;
  // Inside-label fit decisions depend on text metrics: measure with the vendored font.
  const ready = Promise.all([
    document.fonts.load('12px Inter').catch(() => undefined),
    render.preloadTextFont({ family: 'Inter', characters: CHARACTERS }),
  ]).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        {
          type: 'pie',
          name: 'Budget',
          labels: ['Housing', 'Food', 'Transport', 'Savings', 'Leisure', 'Other'],
          values: [1450, 620, 380, 540, 310, 150],
        },
      ],
      layout: {
        font: { family: 'Inter' },
        showlegend: true,
        title: { text: 'Monthly budget' },
        margin: { l: 24, r: 24, t: 56, b: 24 },
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
