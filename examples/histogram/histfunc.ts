import { createChart } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Aggregating histograms (plan E10.1): with both `x` and `y`, `histfunc` aggregates `y` over each
 * `x` bin instead of counting samples. Top: `sum` — total revenue per hour; bottom: `avg` — the
 * average basket per hour, labelled with `texttemplate` (`%{y}` is the bar's value). Two subplots
 * from `layout.grid`, sharing the hourly bins through explicit `xbins`.
 */
export const meta: ExampleMeta = {
  title: 'Histogram: sum and average (histfunc)',
  description:
    'Order values summed (histfunc "sum") and averaged (histfunc "avg") per hour, in two stacked subplots.',
  tags: ['histogram', 'chart', 'histfunc', 'subplots', 'statistical'],
  size: { width: 640, height: 460 },
};

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(41);
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < 1500; i++) {
    const hour = 8 + random() * 14;
    x.push(hour);
    // Evening baskets are larger.
    y.push(Math.round((18 + 2.2 * (hour - 8) + 25 * random() ** 2) * 100) / 100);
  }
  const bins = { start: 8, end: 22, size: 1 };
  const chart = createChart(el, {
    data: [
      { type: 'histogram', x, y, histfunc: 'sum', xbins: bins, name: 'Revenue' },
      {
        type: 'histogram',
        x,
        y,
        histfunc: 'avg',
        xbins: bins,
        name: 'Average basket',
        xaxis: 'x2',
        yaxis: 'y2',
        texttemplate: '%{y:.0f}',
        textposition: 'inside',
      },
    ],
    layout: {
      title: { text: 'Revenue by hour' },
      grid: { rows: 2, columns: 1, pattern: 'independent' },
      yaxis: { title: { text: 'Revenue ($)' } },
      xaxis2: { title: { text: 'Hour of day' } },
      yaxis2: { title: { text: 'Avg basket ($)' } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
