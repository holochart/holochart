import { componentsReady, createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Range breaks for business hours (plan E12.1, E3.8): two weeks of 15-minute prices from a market
 * open 09:00–17:00 (UTC) on weekdays. Two `rangebreaks` hide the weekends (`bounds: ['sat',
 * 'mon']`) and the nights (`pattern: 'hour'`, `bounds: [17, 9]`), so the sessions sit side by side
 * without flat stretches where nothing traded.
 */
export const meta: ExampleMeta = {
  title: 'Time series: business hours with range breaks',
  description:
    'Two weeks of 15-minute prices with weekends and nights hidden by range breaks, so trading sessions sit side by side.',
  tags: ['time-series', 'date', 'line', 'scatter', 'rangebreaks'],
  testTolerance: 0.004,
};

const DAY = 86_400_000;
const STEP = 15 * 60_000;

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(915));
  const x: string[] = [];
  const y: number[] = [];
  let price = 48.2;
  for (let d = 0; d < 14; d++) {
    const day = Date.UTC(2025, 2, 3) + d * DAY; // Monday 3 March 2025
    const weekday = new Date(day).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    for (let t = day + 9 * 3_600_000; t <= day + 17 * 3_600_000; t += STEP) {
      price *= 1 + normal() * 0.0035;
      x.push(new Date(t).toISOString().slice(0, 16).replace('T', ' '));
      y.push(Math.round(price * 100) / 100);
    }
  }

  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Price',
        x,
        y,
        line: { width: 1.5 },
        hovertemplate: '%{x|%a %d %b, %H:%M}<br>%{y:$.2f}<extra></extra>',
      },
    ],
    layout: {
      title: { text: 'Trading sessions, 15-minute prices' },
      showlegend: false,
      xaxis: {
        rangebreaks: [{ bounds: ['sat', 'mon'] }, { bounds: [17, 9], pattern: 'hour' }],
      },
      yaxis: { tickprefix: '$' },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
