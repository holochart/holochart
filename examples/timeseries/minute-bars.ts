import { componentsReady, createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A dense time series (plan E12.1, E16.2): a year of one-minute closes, 525,600 points in one line
 * trace. `x` is a `Float64Array` of millisecond timestamps (no date parsing) on a date axis. The
 * line has thousands of points per pixel column, so it is drawn through a min/max level of detail:
 * per column only the first, lowest, highest and last point, read from a pyramid built once, and
 * only for the view and one view width on each side. It looks the same as drawing every point;
 * zoom in and the detail comes back, down to single minutes. Hover still finds every point.
 */
export const meta: ExampleMeta = {
  title: 'Time series: a year of 1-minute closes',
  description:
    '525,600 one-minute prices in one line, drawn through min/max decimation per pixel column, with full-resolution hover.',
  tags: ['time-series', 'date', 'line', 'scatter', 'performance'],
  testTolerance: 0.004,
};

const MINUTE = 60_000;
const COUNT = 365 * 24 * 60;

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(525_600));
  const start = Date.UTC(2025, 0, 1);
  const x = new Float64Array(COUNT);
  const y = new Float64Array(COUNT);
  let price = 100;
  let vol = 0.0005;
  for (let i = 0; i < COUNT; i++) {
    // A random walk with slowly changing volatility, so calm and busy stretches alternate.
    vol = Math.min(0.002, Math.max(0.0002, vol * (1 + normal() * 0.01)));
    price *= 1 + normal() * vol;
    x[i] = start + i * MINUTE;
    y[i] = price;
  }

  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Close',
        x,
        y,
        line: { width: 1 },
        hovertemplate: '%{x|%d %b %Y %H:%M}<br>%{y:.2f}<extra></extra>',
      },
    ],
    layout: {
      title: { text: '2025, one-minute closes (525,600 points)' },
      showlegend: false,
      xaxis: { type: 'date' },
      yaxis: { title: { text: 'Price' } },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
