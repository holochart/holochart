import { componentsReady, createChart } from '@mk7s/holochart';
import { priceSeries } from '../_lib/prices.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Styled candlesticks (plan E12.3): hollow rising candles (`increasing.fillcolor` transparent)
 * and solid falling ones, each direction with its own outline color and width, whisker caps a
 * third as wide as the body (`whiskerwidth`), and wider candles from a smaller `layout.boxgap`.
 */
export const meta: ExampleMeta = {
  title: 'Candlestick: fills, outlines and whisker caps',
  description:
    'Hollow rising and solid falling candles with custom outlines, whisker caps and a narrower gap between candles.',
  tags: ['candlestick', 'financial', 'time-series', 'date', 'styling'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { x, open, high, low, close } = priceSeries({
    seed: 99,
    bars: 36,
    start: '2024-06-03',
    price: 25,
    volatility: 0.03,
  });
  const chart = createChart(el, {
    data: [
      {
        type: 'candlestick',
        name: 'Vandelay',
        x,
        open,
        high,
        low,
        close,
        whiskerwidth: 0.35,
        increasing: { line: { color: '#6fe3ff', width: 1.5 }, fillcolor: 'rgba(0, 0, 0, 0)' },
        decreasing: { line: { color: '#ff9e00', width: 1 }, fillcolor: '#ff9e00' },
      },
    ],
    layout: {
      title: { text: 'Vandelay, hollow candles' },
      boxgap: 0.15,
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
