import { componentsReady, createChart } from '@mk7s/holochart';
import { priceSeries } from '../_lib/prices.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Basic OHLC chart (plan E12.2): six months of daily bars. Each bar is a line from the low to the
 * high with the open as a tick on the left and the close as a tick on the right, green when the
 * close is above the open and red when it is below. The x axis gets a range slider by default, as
 * in Plotly: drag its window to pan, its ends to zoom.
 */
export const meta: ExampleMeta = {
  title: 'OHLC: basic',
  description:
    'Six months of daily open, high, low and close bars, colored by direction, with the default range slider.',
  tags: ['ohlc', 'financial', 'time-series', 'date', 'rangeslider', 'basic'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { x, open, high, low, close } = priceSeries({ seed: 7, bars: 126, start: '2024-01-02' });
  const chart = createChart(el, {
    data: [{ type: 'ohlc', name: 'ACME', x, open, high, low, close }],
    layout: {
      title: { text: 'ACME, daily' },
      yaxis: { title: { text: 'USD' } },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
