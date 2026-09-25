import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { exposeChart } from './selections-hook.mts';

/**
 * Range slider on an axis with range breaks (plan E5.9, E3.8): a weekday-only daily close with
 * weekends and market holidays removed. The slider skips the breaks too (it shares the axis'
 * compressed linear space), its thumbnail spans all the y data (`rangemode: 'auto'`) and the part
 * of it outside the y range in view is shaded; the y axis is `fixedrange`, as Plotly makes it
 * under a slider. The selector buttons count calendar time back from the range end.
 */
export const meta: ExampleMeta = {
  title: 'Range slider with range breaks',
  description:
    'A weekday-only stock chart (weekends and holidays removed with rangebreaks) with a range slider whose thumbnail autoranges y, and 1m / 3m / all buttons.',
  tags: ['dev', 'axes', 'rangeslider', 'rangeselector', 'rangebreaks', 'date', 'finance'],
  size: { width: 760, height: 420 },
  testTolerance: 0.004,
};

const DAY = 86_400_000;
const HOLIDAYS = ['2024-01-15', '2024-02-19', '2024-03-29', '2024-05-27', '2024-06-19'];

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
  const days = tradingDays('2024-01-02', '2024-06-28');
  const normal = gaussian(rng(23));
  let price = 96;
  const close = days.map((_, i) => {
    price *= 1 + 0.0035 + normal() * 0.017 - (i > 55 && i < 70 ? 0.011 : 0);
    return Math.round(price * 100) / 100;
  });

  // The y axis is fixed to the April–May prices; the thumbnail spans every price.
  const shown = close.filter(
    (_, i) => (days[i] as string) >= '2024-04-01' && (days[i] as string) <= '2024-05-31',
  );
  const lo = Math.floor(Math.min(...shown) / 5) * 5 - 5;
  const hi = Math.ceil(Math.max(...shown) / 5) * 5 + 5;

  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Close',
        x: days,
        y: close,
        hovertemplate: '%{x|%a %b %d}<br>%{y:$.2f}<extra></extra>',
      },
    ],
    layout: {
      title: { text: 'ACME close, trading days only' },
      showlegend: false,
      xaxis: {
        range: ['2024-04-01', '2024-05-31'],
        rangebreaks: [{ bounds: ['sat', 'mon'] }, { values: HOLIDAYS }],
        rangeslider: { yaxis: { rangemode: 'auto' } },
        rangeselector: {
          buttons: [
            { count: 1, label: '1m', step: 'month' },
            { count: 3, label: '3m', step: 'month' },
            { step: 'all', label: 'All' },
          ],
        },
      },
      yaxis: { tickprefix: '$', range: [lo, hi] },
    },
  });
  const dispose = exposeChart(chart);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => {
      dispose();
      chart.destroy();
    },
  };
}
