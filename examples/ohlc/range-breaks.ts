import { componentsReady, createChart } from '@mk7s/holochart';
import { HOLIDAYS_2024, priceSeries } from '../_lib/prices.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * OHLC bars on a trading calendar (plan E12.2, E12.1): `rangebreaks` hide the weekends
 * (`bounds: ['sat', 'mon']`) and the 2024 market holidays (`values`), so the bars sit side by side
 * without gaps where nothing traded. `hovermode: 'x unified'` shows every price of the day under
 * the pointer in one label, with the date as its title; the range slider below shows the whole
 * quarter.
 */
export const meta: ExampleMeta = {
  title: 'OHLC: range breaks and unified hover',
  description:
    'Daily bars with weekends and holidays removed by range breaks, unified hover and the default range slider.',
  tags: ['ohlc', 'financial', 'time-series', 'date', 'rangebreaks', 'rangeslider', 'hover'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { x, open, high, low, close } = priceSeries({
    seed: 11,
    bars: 62,
    start: '2024-05-01',
    price: 180,
    holidays: HOLIDAYS_2024,
  });
  const chart = createChart(el, {
    data: [{ type: 'ohlc', name: 'Umbrella', x, open, high, low, close }],
    layout: {
      title: { text: 'Umbrella, trading days only' },
      hovermode: 'x unified',
      xaxis: {
        rangebreaks: [{ bounds: ['sat', 'mon'] }, { values: [...HOLIDAYS_2024] }],
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
