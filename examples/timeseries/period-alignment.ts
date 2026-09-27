import { componentsReady, createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Period alignment (plan E12.1): a year of daily visitors, and their monthly averages stamped with
 * each month's first day. `xperiod: 'M1'` says each monthly value covers a month and
 * `xperiodalignment: 'middle'` draws it in the middle of that month, over the days it averages,
 * instead of on the 1st. `ticklabelmode: 'period'` centers the month labels the same way.
 */
export const meta: ExampleMeta = {
  title: 'Time series: period alignment',
  description:
    'Daily visitors with monthly averages drawn mid-month via xperiod and xperiodalignment, and period-centered month labels.',
  tags: ['time-series', 'date', 'line', 'scatter', 'xperiod'],
  testTolerance: 0.004,
};

const DAY = 86_400_000;

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(733));
  const start = Date.UTC(2025, 0, 1);
  const days: string[] = [];
  const visitors: number[] = [];
  const months: string[] = [];
  const averages: number[] = [];
  let sum = 0;
  let count = 0;
  for (let i = 0; i <= 365; i++) {
    const date = new Date(start + i * DAY);
    if (count > 0 && (date.getUTCDate() === 1 || i === 365)) {
      const first = new Date(start + (i - count) * DAY);
      months.push(first.toISOString().slice(0, 10));
      averages.push(Math.round(sum / count));
      sum = count = 0;
    }
    if (i === 365) break;
    const season = 1 + 0.35 * Math.sin(((i - 80) / 365) * 2 * Math.PI);
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6 ? 1.3 : 1;
    const v = Math.round(820 * season * weekend * (1 + normal() * 0.08));
    days.push(date.toISOString().slice(0, 10));
    visitors.push(v);
    sum += v;
    count++;
  }

  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Daily',
        x: days,
        y: visitors,
        line: { width: 1 },
        opacity: 0.55,
      },
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Monthly average',
        x: months,
        y: averages,
        xperiod: 'M1',
        xperiodalignment: 'middle',
        line: { width: 2.5 },
        marker: { size: 7 },
        hovertemplate: '%{x|%B %Y}: %{y:,} a day<extra></extra>',
      },
    ],
    layout: {
      title: { text: 'Park visitors, 2025' },
      legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.02, yanchor: 'bottom' },
      xaxis: { dtick: 'M1', tickformat: '%b', ticklabelmode: 'period' },
      yaxis: { title: { text: 'Visitors' } },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
