import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { exposeInteraction } from './spikes-hook.mts';

/**
 * Range breaks (plan E3.8): a weekday-only daily stock chart. `rangebreaks` hide weekends
 * (`bounds: ['sat', 'mon']`) and four market holidays (`values`, one day each by `dvalue`), so the
 * trading days sit side by side with no gaps; ticks never land on a hidden day (weekly ticks fall
 * on Sundays and move to the Monday after). The volume panel below links its x axis with
 * `matches: 'x'`, which also shares the range breaks, so both panels zoom and pan together.
 */
export const meta: ExampleMeta = {
  title: 'Range breaks: weekday-only stock chart',
  description:
    'Daily closes and volume for five months with weekends and holidays removed by rangebreaks; the volume axis matches the price axis.',
  tags: ['dev', 'axes', 'rangebreaks', 'date', 'matches', 'finance', 'scatter', 'bar'],
  size: { width: 760, height: 440 },
  testTolerance: 0.004,
};

const DAY = 86_400_000;
const HOLIDAYS = ['2024-01-15', '2024-02-19', '2024-03-29', '2024-05-27'];

/** Trading days (Mon–Fri, not a holiday) from `start` through `end`, as ISO dates. */
function tradingDays(start: string, end: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(start); t <= Date.parse(end); t += DAY) {
    const d = new Date(t);
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6 && !HOLIDAYS.includes(iso)) out.push(iso);
  }
  return out;
}

export function run(el: HTMLElement): ExampleHandle {
  const days = tradingDays('2024-01-02', '2024-05-31');
  const normal = gaussian(rng(7));
  let price = 182;
  const close = days.map((_, i) => {
    price *= 1 + 0.004 + normal() * 0.016 - (i > 60 && i < 75 ? 0.012 : 0);
    return Math.round(price * 100) / 100;
  });
  const volume = close.map((c, i) =>
    Math.round(40 + Math.abs(normal()) * 25 + (i > 0 ? Math.abs(c - (close[i - 1] ?? c)) * 6 : 0)),
  );

  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Close',
        x: days,
        y: close,
        line: { width: 1.5 },
        hovertemplate: '%{x|%a %b %d}<br>%{y:$.2f}<extra></extra>',
      },
      {
        type: 'bar',
        name: 'Volume',
        x: days,
        y: volume,
        xaxis: 'x2',
        yaxis: 'y2',
        hovertemplate: '%{x|%a %b %d}<br>%{y}M<extra></extra>',
      },
    ],
    layout: {
      title: { text: 'ACME daily close (weekends and holidays removed)' },
      showlegend: false,
      xaxis: {
        anchor: 'y',
        showticklabels: false,
        rangebreaks: [{ bounds: ['sat', 'mon'] }, { values: HOLIDAYS }],
      },
      yaxis: { domain: [0.3, 1], tickprefix: '$' },
      xaxis2: { anchor: 'y2', matches: 'x' },
      yaxis2: { domain: [0, 0.22], ticksuffix: 'M', nticks: 3 },
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
