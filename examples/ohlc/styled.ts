import { componentsReady, createChart } from '@mk7s/holochart';
import { priceSeries } from '../_lib/prices.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Styled OHLC bars (plan E12.2): `increasing.line` and `decreasing.line` set each direction's
 * color, width and dash (falling bars dotted here), and `tickwidth: 0.45` lengthens the open and
 * close ticks to 45% of the bar spacing. The range slider is turned off with
 * `xaxis.rangeslider.visible: false`.
 */
export const meta: ExampleMeta = {
  title: 'OHLC: colors, widths and ticks',
  description:
    'Bars with custom colors and widths per direction, dotted falling bars, longer ticks and no range slider.',
  tags: ['ohlc', 'financial', 'time-series', 'date', 'styling'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { x, open, high, low, close } = priceSeries({
    seed: 21,
    bars: 45,
    start: '2024-03-01',
    price: 42,
    volatility: 0.025,
  });
  const chart = createChart(el, {
    data: [
      {
        type: 'ohlc',
        name: 'Globex',
        x,
        open,
        high,
        low,
        close,
        tickwidth: 0.45,
        increasing: { line: { color: '#3fd0e0', width: 2 } },
        decreasing: { line: { color: '#ff2bd6', width: 2, dash: 'dot' } },
      },
    ],
    layout: {
      title: { text: 'Globex, daily (custom styles)' },
      xaxis: { rangeslider: { visible: false } },
      yaxis: { title: { text: 'USD' }, tickprefix: '$' },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
