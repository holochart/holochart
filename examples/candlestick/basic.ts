import { componentsReady, createChart } from '@mk7s/holochart';
import { priceSeries } from '../_lib/prices.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Basic candlestick chart (plan E12.3): three months of daily candles. Each body spans the open and
 * the close, filled with the direction's color at half opacity (green when the close is above the
 * open, red when below), with wicks to the high and the low. Every body is one instance of a GPU
 * rect set and every wick one segment of a line batch: two draw calls for any number of candles.
 * The x axis gets a range slider by default, as in Plotly.
 */
export const meta: ExampleMeta = {
  title: 'Candlestick: basic',
  description:
    'Three months of daily candles with bodies from open to close and wicks to the high and low, and the default range slider.',
  tags: ['candlestick', 'financial', 'time-series', 'date', 'rangeslider', 'basic'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { x, open, high, low, close } = priceSeries({ seed: 12, bars: 64, start: '2024-02-01' });
  const chart = createChart(el, {
    data: [{ type: 'candlestick', name: 'ACME', x, open, high, low, close }],
    layout: {
      title: { text: 'ACME, daily candles' },
      yaxis: { title: { text: 'USD' } },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
