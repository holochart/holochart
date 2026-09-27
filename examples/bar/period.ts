import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Period-aligned bars (plan E3.5): monthly totals are given at each month's first day, and
 * `xperiod: 'M1'` with `xperiodalignment: 'middle'` draws each bar in the middle of its month, as
 * Plotly does. The target line uses the same period, so its markers sit on the bar centers, and
 * `ticklabelmode: 'period'` centers the month labels under their months. Hover shows the dates as
 * given (the first of the month), not the aligned positions.
 */
export const meta: ExampleMeta = {
  title: 'Bar: period alignment',
  description:
    'Monthly bars drawn mid-month with xperiod M1 and xperiodalignment, with a scatter target line aligned the same way.',
  tags: ['bar', 'chart', 'date', 'period', 'scatter'],
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
  const months = Array.from({ length: 12 }, (_, i) => `2024-${String(i + 1).padStart(2, '0')}-01`);
  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        name: 'Sales',
        x: months,
        y: [42, 38, 51, 57, 63, 71, 68, 74, 66, 59, 64, 82],
        xperiod: 'M1',
        xperiodalignment: 'middle',
        hovertemplate: '%{x|%B %Y}: %{y} units<extra></extra>',
      },
      {
        type: 'scatter',
        name: 'Target',
        mode: 'lines+markers',
        x: months,
        y: [45, 45, 50, 55, 60, 65, 70, 70, 65, 60, 65, 75],
        xperiod: 'M1',
        xperiodalignment: 'middle',
        line: { width: 2 },
        marker: { size: 7 },
      },
    ],
    layout: {
      xaxis: { dtick: 'M1', tickformat: '%b', ticklabelmode: 'period' },
      yaxis: { title: { text: 'Units' } },
      legend: { orientation: 'h', x: 0, y: 1.12 },
    },
    config: { responsive: true },
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
