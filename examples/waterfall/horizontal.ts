import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A horizontal waterfall (plan E12.4): with only `x` values given the bars run along x, one per `y`
 * stage (here explicit `orientation: 'h'`). An `absolute` bar sets the opening cash position,
 * relative bars move it, and the closing `total` sums it up. Labels show the running total after
 * each bar (`textinfo: 'final'`), and the direction colors are restyled per trace.
 */
export const meta: ExampleMeta = {
  title: 'Waterfall: horizontal cash bridge',
  description:
    'A horizontal waterfall from an absolute opening balance through inflows and outflows to the closing total, labeled with running totals.',
  tags: ['waterfall', 'financial', 'chart', 'horizontal', 'measure', 'text'],
  size: { width: 720, height: 420 },
  testTolerance: 0.004,
};

const CHARACTERS = '0123456789.,+-−$k ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        {
          type: 'waterfall',
          name: 'Cash',
          orientation: 'h',
          y: [
            'Opening cash',
            'Customer receipts',
            'Supplier payments',
            'Payroll',
            'Loan drawdown',
            'Capex',
            'Closing cash',
          ],
          x: [1200, 2150, -1320, -860, 500, -740, null],
          measure: [
            'absolute',
            'relative',
            'relative',
            'relative',
            'relative',
            'relative',
            'total',
          ],
          textinfo: 'final',
          textposition: 'inside',
          increasing: { marker: { color: '#128b8b' } },
          decreasing: { marker: { color: '#cc540a' } },
          totals: { marker: { color: '#5e74d5', line: { color: '#eceef4', width: 1 } } },
        },
      ],
      layout: {
        title: { text: 'Cash bridge, Q3' },
        xaxis: { title: { text: 'k USD' } },
        yaxis: { autorange: 'reversed' },
        margin: { l: 110 },
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
