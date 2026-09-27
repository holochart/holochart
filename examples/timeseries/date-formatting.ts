import { componentsReady, createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Date formatting (plan E12.1): eighteen months of daily orders. `tickformatstops` picks the tick
 * label format from the tick step, so the labels read `Jan 2025` at this zoom and change to day or
 * hour formats when you zoom in; `ticklabelmode: 'period'` centers each month label in its month.
 * The hover label formats the date with `%{x|…}` (d3-time-format codes), and the y axis formats
 * thousands with `tickformat`.
 */
export const meta: ExampleMeta = {
  title: 'Time series: date formatting',
  description:
    'Daily orders with zoom-dependent tick formats (tickformatstops), period-centered month labels and a formatted hover date.',
  tags: ['time-series', 'date', 'line', 'scatter', 'axes'],
  testTolerance: 0.004,
};

const DAY = 86_400_000;

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(1207));
  const start = Date.UTC(2024, 6, 1);
  const x: number[] = [];
  const y: number[] = [];
  let level = 3200;
  for (let i = 0; i < 548; i++) {
    const t = start + i * DAY;
    const weekday = new Date(t).getUTCDay();
    level += 6 + normal() * 60;
    const season = 1 + 0.25 * Math.sin(((i - 120) / 365) * 2 * Math.PI);
    y.push(Math.round(level * season * (weekday === 0 || weekday === 6 ? 0.7 : 1)));
    x.push(t);
  }

  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Orders',
        x,
        y,
        line: { width: 1.5 },
        hovertemplate: '%{x|%A, %d %B %Y}<br>%{y:,} orders<extra></extra>',
      },
    ],
    layout: {
      title: { text: 'Daily orders' },
      xaxis: {
        type: 'date',
        ticklabelmode: 'period',
        tickformatstops: [
          { dtickrange: [null, DAY], value: '%H:%M' },
          { dtickrange: [DAY, 'M1'], value: '%d %b' },
          { dtickrange: ['M1', 'M12'], value: '%b %Y' },
          { dtickrange: ['M12', null], value: '%Y' },
        ],
      },
      yaxis: { title: { text: 'Orders per day' }, tickformat: ',d' },
      showlegend: false,
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
