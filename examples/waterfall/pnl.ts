import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Profit and loss as a waterfall (plan E12.4): each `relative` bar adds its change to the running
 * total (rising bars green, falling bars red), and `total` bars show the running total so far
 * (blue) without a value of their own. Connector lines join each bar's end to the next bar, and
 * `textinfo: 'delta'` labels every bar with its change — a sum bar's change is the total it shows.
 */
export const meta: ExampleMeta = {
  title: 'Waterfall: profit and loss',
  description:
    'Revenue, costs and taxes as relative bars with subtotal and total bars, connector lines and change labels outside the bars.',
  tags: ['waterfall', 'financial', 'chart', 'measure', 'totals', 'text', 'basic'],
  size: { width: 720, height: 420 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

const CHARACTERS = '0123456789.,+-−$k ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  // Measure labels with the shipped default font (inside/outside decisions are deterministic).
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        {
          type: 'waterfall',
          name: 'FY 2025',
          x: [
            'Product sales',
            'Services',
            'Net revenue',
            'Purchases',
            'Salaries',
            'Other expenses',
            'Profit before tax',
            'Taxes',
            'Net profit',
          ],
          measure: [
            'relative',
            'relative',
            'total',
            'relative',
            'relative',
            'relative',
            'total',
            'relative',
            'total',
          ],
          y: [420, 160, null, -180, -150, -45, null, -52, null],
          textinfo: 'delta',
          textposition: 'outside',
        },
      ],
      layout: {
        title: { text: 'Profit and loss, FY 2025' },
        yaxis: { title: { text: 'k USD' } },
        showlegend: false,
      },
      config: { responsive: true },
    });
    await componentsReady(chart);
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
