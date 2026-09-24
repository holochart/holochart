import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { exposeInteraction } from './spikes-hook.mts';

/**
 * Range breaks (plan E3.8) on intraday data: 15-minute prices for two trading weeks, with nights
 * (`pattern: 'hour'`, `bounds: [16, 9.5]`, wrapping past midnight) and weekends
 * (`pattern: 'day of week'`) removed. The two patterns overlap on weekend nights and are merged.
 * Every session is the same width; the day ticks that would fall at midnight move to the 09:30
 * open. Patterns use UTC hours, so the timestamps here are UTC.
 */
export const meta: ExampleMeta = {
  title: 'Range breaks: intraday sessions',
  description:
    'Two weeks of 15-minute prices with nights (hour pattern) and weekends (day-of-week pattern) removed.',
  tags: ['dev', 'axes', 'rangebreaks', 'date', 'finance', 'scatter'],
  size: { width: 760, height: 380 },
  testTolerance: 0.004,
};

const MIN15 = 15 * 60_000;

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(11));
  const x: number[] = [];
  const y: number[] = [];
  let price = 100;
  const start = Date.parse('2024-03-04T00:00:00Z'); // a Monday
  for (let day = 0; day < 14; day++) {
    const dow = (1 + day) % 7;
    if (dow === 0 || dow === 6) continue;
    const open = start + day * 86_400_000 + 9.5 * 3_600_000;
    // 09:30 through 15:45: 26 bars; the session gaps a little overnight.
    price += normal() * 0.8;
    for (let k = 0; k < 26; k++) {
      price += normal() * 0.18 + (k < 4 ? 0.04 : 0);
      x.push(open + k * MIN15);
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
        line: { width: 1.25 },
        hovertemplate: '%{x|%a %d %H:%M}<br>%{y:.2f}<extra></extra>',
      },
    ],
    layout: {
      title: { text: 'Intraday, 09:30–16:00 UTC sessions only' },
      showlegend: false,
      xaxis: {
        type: 'date',
        rangebreaks: [
          { pattern: 'hour', bounds: [16, 9.5] },
          { pattern: 'day of week', bounds: [6, 1] },
        ],
      },
      yaxis: { tickformat: '.0f' },
    },
  });
  const dispose = exposeInteraction(chart);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => {
      dispose();
      chart.destroy();
    },
  };
}
