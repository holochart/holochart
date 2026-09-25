import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { exposeChart } from './selections-hook.mts';

/**
 * Range slider and range selector (plan E5.9): two years of daily highs and lows. The slider
 * under the x axis shows all the data (the traces drawn a second time, not a picture) with a
 * window over the six months in view; drag the window to pan, its ends to zoom, or click beside
 * it to center it there. The buttons above the plot set the range to the last month, six
 * months, year to date or year, or back to everything; the one whose range is in view is active.
 */
export const meta: ExampleMeta = {
  title: 'Range slider and selector: daily time series',
  description:
    'Two years of daily highs and lows with a range slider thumbnail under the x axis and 1m / 6m / YTD / 1y / all range selector buttons.',
  tags: ['dev', 'axes', 'rangeslider', 'rangeselector', 'date', 'time series', 'scatter'],
  size: { width: 760, height: 440 },
  testTolerance: 0.004,
};

const DAY = 86_400_000;

export function run(el: HTMLElement): ExampleHandle {
  const start = Date.parse('2023-01-01');
  const n = 730;
  const normal = gaussian(rng(11));
  const x: string[] = [];
  const high: number[] = [];
  const low: number[] = [];
  let level = 132;
  for (let i = 0; i < n; i++) {
    level += 0.08 + normal() * 1.6 + Math.sin(i / 45) * 0.35;
    const spread = 2 + Math.abs(normal()) * 2.5;
    x.push(new Date(start + i * DAY).toISOString().slice(0, 10));
    high.push(Math.round((level + spread) * 100) / 100);
    low.push(Math.round((level - spread) * 100) / 100);
  }

  const chart = createChart(el, {
    data: [
      { type: 'scatter', mode: 'lines', name: 'High', x, y: high },
      { type: 'scatter', mode: 'lines', name: 'Low', x, y: low },
    ],
    layout: {
      title: { text: 'Daily high and low' },
      xaxis: {
        range: ['2024-07-01', '2024-12-31'],
        rangeslider: {},
        rangeselector: {
          buttons: [
            { count: 1, label: '1m', step: 'month', stepmode: 'backward' },
            { count: 6, label: '6m', step: 'month', stepmode: 'backward' },
            { count: 1, label: 'YTD', step: 'year', stepmode: 'todate' },
            { count: 1, label: '1y', step: 'year', stepmode: 'backward' },
            { step: 'all' },
          ],
        },
      },
      yaxis: { tickprefix: '$' },
    },
  });
  const dispose = exposeChart(chart);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => {
      dispose();
      chart.destroy();
    },
  };
}
