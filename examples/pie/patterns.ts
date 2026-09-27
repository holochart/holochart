import { createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Pie with patterns (plan E9.11, E8.10): `marker.pattern.shape` per slice. With the default
 * `fillmode: 'replace'` a pie's pattern background is the paper color (Plotly), so slices read as
 * hatches in their colors; the tiles are anchored at the pie center. The legend glyphs show the
 * patterns too.
 */
export const meta: ExampleMeta = {
  title: 'Pie: patterns',
  description: 'Six slices, each hatched with its own pattern shape in its slice color.',
  tags: ['pie', 'chart', 'pattern', 'legend'],
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

/** Resolves once the slice labels are typeset and drawn (frames stop coming). */
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
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        {
          type: 'pie',
          name: 'Budget',
          labels: ['Housing', 'Food', 'Transport', 'Savings', 'Leisure', 'Other'],
          values: [1450, 620, 380, 540, 310, 150],
          textinfo: 'label',
          marker: {
            line: { width: 1.5 },
            pattern: { shape: ['/', '.', 'x', '-', '\\', '+'], solidity: 0.4 },
          },
        },
      ],
      layout: {
        showlegend: true,
        title: { text: 'Monthly budget' },
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
