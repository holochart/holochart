import { componentsReady, createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Range slider and range selector (plan E12.1, E5.9): three years of daily electricity demand.
 * The range slider under the axis shows the whole series with a window over the range in view;
 * drag it to pan, drag its ends to zoom. The range selector buttons above the plot jump to the
 * last month, the last six months, the year to date or everything. The figure opens on the last
 * six months (`xaxis.range`).
 */
export const meta: ExampleMeta = {
  title: 'Time series: range slider and selector',
  description:
    'Three years of daily electricity demand with a range slider overview and 1m / 6m / YTD / 1y / all buttons.',
  tags: ['time-series', 'date', 'line', 'scatter', 'rangeslider', 'rangeselector'],
  size: { width: 760, height: 440 },
  testTolerance: 0.004,
};

const DAY = 86_400_000;

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(4242));
  const start = Date.UTC(2023, 0, 1);
  const x: string[] = [];
  const y: number[] = [];
  let noise = 0;
  for (let i = 0; i < 3 * 365; i++) {
    const t = start + i * DAY;
    const date = new Date(t);
    // Winter heating and summer cooling peaks, lower weekends, a slow upward trend.
    const phase = (i / 365.25) * 2 * Math.PI;
    const seasonal = 1 + 0.18 * Math.cos(phase) + 0.08 * Math.cos(2 * phase);
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6 ? 0.88 : 1;
    noise = 0.7 * noise + normal() * 0.025;
    x.push(date.toISOString().slice(0, 10));
    y.push(Math.round(310 * seasonal * weekend * (1 + i * 0.00005) * (1 + noise)));
  }

  const chart = createChart(el, {
    data: [{ type: 'scatter', mode: 'lines', name: 'Demand', x, y, line: { width: 1.5 } }],
    layout: {
      title: { text: 'Daily electricity demand' },
      showlegend: false,
      xaxis: {
        range: ['2025-07-01', '2025-12-31'],
        rangeslider: {},
        rangeselector: {
          buttons: [
            { count: 1, label: '1m', step: 'month', stepmode: 'backward' },
            { count: 6, label: '6m', step: 'month', stepmode: 'backward' },
            { count: 1, label: 'YTD', step: 'year', stepmode: 'todate' },
            { count: 1, label: '1y', step: 'year', stepmode: 'backward' },
            { step: 'all' },
          ],
        },
      },
      yaxis: { title: { text: 'GWh' } },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
