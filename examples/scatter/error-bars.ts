import { componentsReady, createChart, type Chart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Error bars (plan E9.7): symmetric `data` arrays, asymmetric `data` (`arrayminus`), `percent`
 * and `sqrt` types, horizontal `constant` bars with `copy_ystyle`, and custom color / thickness /
 * cap width. Error-bar ends count in the autorange.
 */
export const meta: ExampleMeta = {
  title: 'Scatter: error bars',
  description:
    'error_y data (symmetric and asymmetric), percent and sqrt; error_x constant with copy_ystyle; custom thickness, width and color.',
  tags: ['scatter', 'error-bars'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const random = rng(41);

  const x = [1, 2, 3, 4, 5, 6];
  const a = x.map((v) => 2 + v * 0.6 + random());
  const up = x.map(() => 0.3 + random() * 0.5);
  const down = x.map(() => 0.1 + random() * 0.3);

  const ready = (async () => {
    useExampleFonts();
    await document.fonts.load('12px Inter');
    if (disposed) return;
    chart = createChart(el, {
      data: [
        {
          name: 'data ± array',
          x,
          y: a,
          mode: 'lines+markers',
          error_y: { type: 'data', array: up },
        },
        {
          name: 'asymmetric',
          x: x.map((v) => v + 0.15),
          y: a.map((v) => v + 3),
          mode: 'markers',
          error_y: { type: 'data', array: up, arrayminus: down, color: '#d62728', thickness: 1.5 },
        },
        {
          name: 'percent + x constant',
          x,
          y: a.map((v) => v - 3),
          mode: 'markers',
          marker: { symbol: 'square', size: 7 },
          error_y: { type: 'percent', value: 15, width: 8 },
          error_x: { type: 'constant', value: 0.25 },
        },
        {
          name: 'sqrt',
          x: x.map((v) => v + 7),
          y: [4, 9, 16, 25, 36, 49].map((v) => v / 6),
          mode: 'lines+markers',
          line: { dash: 'dot' },
          error_y: { type: 'sqrt', thickness: 3, width: 0, color: 'rgba(44, 160, 44, 0.5)' },
        },
      ],
      layout: {
        font: { family: 'Inter', size: 11 },
        margin: { l: 40, r: 20, t: 20, b: 30 },
        plot_bgcolor: '#e5ecf6',
      },
    });
    await componentsReady(chart);
  })();

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
