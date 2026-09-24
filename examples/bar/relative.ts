import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Relative stacking (plan E9.9): `barmode: 'relative'` stacks positive values up from zero and
 * negative values down from zero separately, e.g. inflows and outflows per period.
 */
export const meta: ExampleMeta = {
  title: 'Bar: relative',
  description: 'Positive values stack above zero and negative values below it, per position.',
  tags: ['bar', 'chart', 'relative', 'barmode', 'negative'],
};

const QUIET_MS = 500;

/**
 * `chart.ready` covers the first frame only; text (tick labels) typesets asynchronously and redraws
 * later. Resolve once frames have stopped for a while so visual tests capture the final frame.
 */
function settled(chart: Chart): Promise<void> {
  return chart.ready.then(
    () =>
      new Promise<void>((resolve) => {
        const done = (): void => {
          off();
          resolve();
        };
        let timer = setTimeout(done, QUIET_MS);
        const off = chart.on('afterrender', () => {
          clearTimeout(timer);
          timer = setTimeout(done, QUIET_MS);
        });
      }),
  );
}

export function run(el: HTMLElement): ExampleHandle {
  const x = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
  const chart = createChart(el, {
    data: [
      { type: 'bar', name: 'Sales', x, y: [12, 15, 9, 14, 18, 16, 20, 17] },
      { type: 'bar', name: 'Refunds', x, y: [-3, -2, -6, -4, -3, -7, -5, -2] },
      { type: 'bar', name: 'Fees', x, y: [-2, -2, 3, -3, -2, 4, -4, -3] },
      { type: 'bar', name: 'Grants', x, y: [4, 0, 5, 2, 0, 6, 3, 5] },
    ],
    layout: {
      barmode: 'relative',
      bargap: 0.3,
    },
    config: { responsive: true },
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
