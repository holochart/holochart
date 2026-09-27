import { componentsReady, createChart } from '@mk7s/holochart';
import { priceSeries } from '../_lib/prices.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Intraday candlesticks (plan E12.3, E12.1): three trading days of 15-minute candles from a session
 * open 09:30–16:00 (UTC), spanning a weekend. Two `rangebreaks` hide the nights (`pattern:
 * 'hour'`, `bounds: [16, 9.5]`) and the weekend, so the sessions join without empty stretches;
 * candles keep their width across the breaks. `hovermode: 'x'` puts the time in a label on the
 * axis and the four prices beside the candle.
 */
export const meta: ExampleMeta = {
  title: 'Candlestick: intraday with overnight breaks',
  description:
    'Fifteen-minute candles over three sessions with nights and the weekend hidden by range breaks.',
  tags: ['candlestick', 'financial', 'time-series', 'date', 'rangebreaks', 'intraday'],
  size: { width: 760, height: 420 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { x, open, high, low, close } = priceSeries({
    seed: 1530,
    bars: 78,
    start: '2025-03-06 09:30',
    minutes: 15,
    session: [9.5, 16],
    price: 212,
    volatility: 0.02,
  });
  const chart = createChart(el, {
    data: [{ type: 'candlestick', name: 'Wonka', x, open, high, low, close }],
    layout: {
      title: { text: 'Wonka, 15-minute candles' },
      hovermode: 'x',
      xaxis: {
        rangeslider: { visible: false },
        rangebreaks: [{ bounds: ['sat', 'mon'] }, { bounds: [16, 9.5], pattern: 'hour' }],
      },
      yaxis: { title: { text: 'USD' } },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
