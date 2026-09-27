import { componentsReady, createChart } from '@mk7s/holochart';
import { HOLIDAYS_2024, priceSeries } from '../_lib/prices.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Candlesticks on a trading calendar with a range selector (plan E12.3, E12.1): a year of daily
 * candles where `rangebreaks` hide the weekends and the 2024 market holidays, so candles sit side
 * by side at an even width. The range selector buttons jump to the last month, the last three
 * months, the year to date or everything; the range slider shows the whole year. The figure opens
 * on the last three months.
 */
export const meta: ExampleMeta = {
  title: 'Candlestick: range breaks and range selector',
  description:
    'A year of daily candles with weekends and holidays hidden, range selector buttons and the default range slider.',
  tags: [
    'candlestick',
    'financial',
    'time-series',
    'date',
    'rangebreaks',
    'rangeselector',
    'rangeslider',
  ],
  size: { width: 760, height: 440 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { x, open, high, low, close } = priceSeries({
    seed: 2024,
    bars: 252,
    start: '2024-01-02',
    price: 140,
    holidays: HOLIDAYS_2024,
  });
  const chart = createChart(el, {
    data: [{ type: 'candlestick', name: 'Soylent', x, open, high, low, close }],
    layout: {
      title: { text: 'Soylent, 2024' },
      xaxis: {
        range: ['2024-10-01', '2024-12-31'],
        rangebreaks: [{ bounds: ['sat', 'mon'] }, { values: [...HOLIDAYS_2024] }],
        rangeselector: {
          buttons: [
            { count: 1, label: '1m', step: 'month', stepmode: 'backward' },
            { count: 3, label: '3m', step: 'month', stepmode: 'backward' },
            { count: 1, label: 'YTD', step: 'year', stepmode: 'todate' },
            { step: 'all' },
          ],
        },
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
