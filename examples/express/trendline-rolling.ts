import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { prices } from './datasets.mts';

/**
 * Express moving-window trendlines (plan E23.5) on a daily time series: `trendline: 'rolling'`
 * with a 20-observation window draws pandas' `rolling(20).mean()` per ticker (undefined for the
 * first 19 days, `minPeriods` defaults to the window), and a second figure with `trendline:
 * 'ewm'` and `halflife: 5` gives the exponentially weighted mean, whose lines are added to the
 * first — Express figures are plain data to combine before rendering.
 */
export const meta: ExampleMeta = {
  title: 'Express: rolling and EWM trendlines on a time series',
  description:
    'Daily closes of two tickers with a 20-day rolling mean and a dashed exponentially weighted mean (halflife 5).',
  tags: ['express', 'scatter', 'trendline', 'rolling', 'ewm', 'time series', 'dates'],
  size: { width: 640, height: 420 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const rows = prices();
  const common = { x: 'date', y: 'close', color: 'ticker', opacity: 0.35 } as const;
  const figure = hx.scatter(rows, {
    ...common,
    trendline: 'rolling',
    trendlineOptions: { window: 20 },
    title: '20-day rolling mean and EWM (halflife 5)',
  });
  const ewm = hx.scatter(rows, { ...common, trendline: 'ewm', trendlineOptions: { halflife: 5 } });
  for (const trace of ewm.data) {
    if (trace['mode'] !== 'lines') continue;
    trace['line'] = { dash: 'dot', width: 1.5 };
    figure.data.push(trace);
  }
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
