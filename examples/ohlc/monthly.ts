import { componentsReady, createChart } from '@mk7s/holochart';
import { priceSeries } from '../_lib/prices.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Monthly OHLC bars with period alignment (plan E12.2, E3.5): three years of daily prices rolled up
 * into one bar per month, each given at the month's first trading day. `xperiod: 'M1'` with
 * `xperiodalignment: 'middle'` centers every bar in its month, so the bars line up with the
 * monthly ticks, and hover labels still show the date given in `x`.
 */
export const meta: ExampleMeta = {
  title: 'OHLC: monthly bars with period alignment',
  description:
    'Three years of monthly bars centered in their months with xperiod, next to the monthly ticks.',
  tags: ['ohlc', 'financial', 'time-series', 'date', 'period'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const daily = priceSeries({ seed: 5, bars: 756, start: '2022-01-03', price: 60 });
  const x: string[] = [];
  const open: number[] = [];
  const high: number[] = [];
  const low: number[] = [];
  const close: number[] = [];
  daily.x.forEach((date, i) => {
    const month = date.slice(0, 7);
    const last = x.length - 1;
    if (last < 0 || x[last]!.slice(0, 7) !== month) {
      x.push(date);
      open.push(daily.open[i]!);
      high.push(daily.high[i]!);
      low.push(daily.low[i]!);
      close.push(daily.close[i]!);
      return;
    }
    high[last] = Math.max(high[last]!, daily.high[i]!);
    low[last] = Math.min(low[last]!, daily.low[i]!);
    close[last] = daily.close[i]!;
  });

  const chart = createChart(el, {
    data: [
      {
        type: 'ohlc',
        name: 'Initech',
        x,
        open,
        high,
        low,
        close,
        xperiod: 'M1',
        xperiodalignment: 'middle',
      },
    ],
    layout: {
      title: { text: 'Initech, monthly bars' },
      xaxis: { rangeslider: { visible: false }, dtick: 'M3', tickformat: '%b %Y' },
      yaxis: { title: { text: 'USD' } },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
