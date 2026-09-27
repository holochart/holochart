import { componentsReady, createChart } from '@mk7s/holochart';
import { movingAverage, priceSeries } from '../_lib/prices.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * OHLC bars with indicators (plan E12.2): a 20-day moving average and Bollinger bands (two
 * standard deviations around it) drawn as scatter lines on the same axes, the band filled with
 * `fill: 'tonexty'`. Financial traces draw under scatter traces (Plotly's layer order), so the
 * lines stay on top of the bars.
 */
export const meta: ExampleMeta = {
  title: 'OHLC: moving average and Bollinger bands',
  description:
    'Daily bars under a 20-day moving average and a filled two-sigma Bollinger band drawn with scatter traces.',
  tags: ['ohlc', 'financial', 'time-series', 'date', 'scatter', 'line', 'area'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { x, open, high, low, close } = priceSeries({
    seed: 3,
    bars: 150,
    start: '2024-01-02',
    price: 75,
  });
  const n = 20;
  const mean = movingAverage(close, n);
  const band = (sign: 1 | -1) =>
    close.map((_, i) => {
      const m = mean[i];
      if (m === null || m === undefined) return null;
      const window = close.slice(i - n + 1, i + 1);
      const sd = Math.sqrt(window.reduce((s, v) => s + (v - m) ** 2, 0) / n);
      return Math.round((m + sign * 2 * sd) * 100) / 100;
    });

  const chart = createChart(el, {
    data: [
      { type: 'ohlc', name: 'Hooli', x, open, high, low, close },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Upper band',
        x,
        y: band(1),
        line: { width: 1, color: '#5e74d5' },
        showlegend: false,
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Bollinger (20, 2)',
        x,
        y: band(-1),
        fill: 'tonexty',
        fillcolor: 'rgba(94, 116, 213, 0.12)',
        line: { width: 1, color: '#5e74d5' },
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'SMA 20',
        x,
        y: mean,
        line: { width: 1.5, color: '#ff9e00' },
      },
    ],
    layout: {
      title: { text: 'Hooli with Bollinger bands' },
      xaxis: { rangeslider: { visible: false } },
      yaxis: { title: { text: 'USD' } },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
