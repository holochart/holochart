import { componentsReady, createChart } from '@mk7s/holochart';
import { HOLIDAYS_2024, movingAverage, priceSeries } from '../_lib/prices.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Recipe: a trading chart (plan E12.3). Candlesticks with 20- and 50-day moving averages on top,
 * buy and sell markers where the averages cross, and a volume subplot underneath sharing the x
 * axis (`xaxis.anchor: 'y2'`, two y domains), its bars colored by the candle's direction. Range
 * breaks hide weekends and holidays on both subplots at once, since they share the axis. The range
 * slider is off: the volume panel already sits under the prices.
 */
export const meta: ExampleMeta = {
  title: 'Recipe: candlesticks with volume, moving averages and signals',
  description:
    'Daily candles with 20/50-day moving averages, crossover buy and sell markers, and a volume subplot on a shared date axis.',
  tags: ['recipe', 'candlestick', 'financial', 'time-series', 'bar', 'scatter', 'subplots'],
  size: { width: 760, height: 520 },
  testTolerance: 0.004,
};

const UP = '#118e36';
const DOWN = '#ea2a37';

export function run(el: HTMLElement): ExampleHandle {
  const { x, open, high, low, close, volume } = priceSeries({
    seed: 404,
    bars: 180,
    start: '2024-01-02',
    price: 58,
    holidays: HOLIDAYS_2024,
  });
  const fast = movingAverage(close, 20);
  const slow = movingAverage(close, 50);
  const buys: { x: string[]; y: number[] } = { x: [], y: [] };
  const sells: { x: string[]; y: number[] } = { x: [], y: [] };
  for (let i = 1; i < x.length; i++) {
    const [f0, s0, f1, s1] = [fast[i - 1], slow[i - 1], fast[i], slow[i]];
    if (f0 == null || s0 == null || f1 == null || s1 == null) continue;
    if (f0 <= s0 && f1 > s1) {
      buys.x.push(x[i]!);
      buys.y.push(Math.round(low[i]! * 0.97 * 100) / 100);
    } else if (f0 >= s0 && f1 < s1) {
      sells.x.push(x[i]!);
      sells.y.push(Math.round(high[i]! * 1.03 * 100) / 100);
    }
  }

  const chart = createChart(el, {
    data: [
      { type: 'candlestick', name: 'ACME', x, open, high, low, close },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'SMA 20',
        x,
        y: fast,
        line: { width: 1.25, color: '#ff9e00' },
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'SMA 50',
        x,
        y: slow,
        line: { width: 1.25, color: '#5e74d5' },
      },
      {
        type: 'scatter',
        mode: 'markers',
        name: 'Buy',
        ...buys,
        marker: {
          symbol: 'triangle-up',
          size: 10,
          color: UP,
          line: { width: 1, color: '#eceef4' },
        },
      },
      {
        type: 'scatter',
        mode: 'markers',
        name: 'Sell',
        ...sells,
        marker: {
          symbol: 'triangle-down',
          size: 10,
          color: DOWN,
          line: { width: 1, color: '#eceef4' },
        },
      },
      {
        type: 'bar',
        name: 'Volume',
        x,
        y: volume,
        yaxis: 'y2',
        marker: { color: close.map((c, i) => (c >= open[i]! ? UP : DOWN)), opacity: 0.7 },
        showlegend: false,
      },
    ],
    layout: {
      title: { text: 'ACME: price, trend and volume' },
      xaxis: {
        anchor: 'y2',
        rangeslider: { visible: false },
        rangebreaks: [{ bounds: ['sat', 'mon'] }, { values: [...HOLIDAYS_2024] }],
      },
      yaxis: { domain: [0.3, 1], title: { text: 'USD' } },
      yaxis2: { domain: [0, 0.22], title: { text: 'Volume' }, tickformat: '.2s' },
      bargap: 0.3,
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
