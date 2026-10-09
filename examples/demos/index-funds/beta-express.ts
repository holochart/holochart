import { createChart, type Chart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { BASE, dailyReturns, fmtDate, halfOf, HALVES, PERIODS } from './analysis.mts';
import { chartConfig, frame, isNarrow, settled } from './ui.mts';

/**
 * The Nasdaq-100's daily return (QQQ) against the S&P 500's (SPY), built from a table of days with
 * the Express API: `hx.scatter` with `color` by half (teal 2022–24, amber 2024–26),
 * `trendline: 'ols'` (one least-squares line per half) and `marginalX` / `marginalY` histograms
 * that share the main plot's axes. The fitted slopes (QQQ's beta to SPY) come back from
 * `hx.getTrendlineResults(figure)` and go into the legend names. The figure is plain JSON, so the
 * axes get percent ticks and the marginals shared bins with a small edit before `createChart`.
 *
 * The axes are clipped to ±4% for SPY and ±5% for QQQ; five sessions fall outside (one in the
 * first half, four in the second) and still count in the fits.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: QQQ against SPY, half by half (Express)',
  description:
    'Express scatter of QQQ against SPY daily returns, colored by half, with an OLS trendline per half and marginal histograms.',
  tags: ['demo', 'express', 'scatter', 'trendline', 'ols', 'marginal', 'histogram', 'financial'],
  size: { width: 960, height: 560 },
  testTolerance: 0.004,
};

interface DayRow {
  date: string;
  spy: number;
  qqq: number;
  half: string;
}

/** Axis half-ranges: SPY's and QQQ's. */
const SPAN_X = 0.04;
const SPAN_Y = 0.05;
/** Bins per marginal histogram. */
const BINS = 40;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const spy = dailyReturns('SPY');
  const qqq = dailyReturns('QQQ');
  const rows: DayRow[] = spy.r.map((r, i) => ({
    date: fmtDate(spy.dates[i] as string),
    spy: r,
    qqq: qqq.r[i] as number,
    half: PERIODS[halfOf(BASE + 1 + i)].label,
  }));

  const figure = hx.scatter(rows, {
    x: 'spy',
    y: 'qqq',
    color: 'half',
    colorDiscreteSequence: HALVES.map((h) => PERIODS[h].color),
    categoryOrders: { half: HALVES.map((h) => PERIODS[h].label) },
    trendline: 'ols',
    marginalX: 'histogram',
    marginalY: 'histogram',
    hoverName: 'date',
    hoverData: { spy: ':+.2%', qqq: ':+.2%', half: false },
    opacity: 0.55,
    rangeX: [-SPAN_X, SPAN_X],
    rangeY: [-SPAN_Y, SPAN_Y],
    labels: { spy: 'SPY daily return', qqq: 'QQQ daily return', half: 'Half' },
    title: narrow ? undefined : 'QQQ against SPY, every session: the slope is QQQ’s beta',
  });

  // The fitted slope of each half, into its legend name.
  for (const result of hx.getTrendlineResults(figure)) {
    const half = result.groups['Half'];
    const slope = result.fit.params[1] as number;
    for (const trace of figure.data) {
      if (trace['name'] === half) trace['name'] = `${half}: slope ${slope.toFixed(2)}`;
    }
  }
  // Marginals: the two halves overlaid on shared bins, instead of side by side.
  for (const trace of figure.data) {
    if (trace['type'] !== 'histogram') continue;
    delete trace['offsetgroup'];
    delete trace['alignmentgroup'];
    trace['opacity'] = 0.6;
    if (trace['x'] !== undefined)
      trace['xbins'] = { start: -SPAN_X, end: SPAN_X, size: (2 * SPAN_X) / BINS };
    else trace['ybins'] = { start: -SPAN_Y, end: SPAN_Y, size: (2 * SPAN_Y) / BINS };
  }
  const layout = figure.layout;
  layout['barmode'] = 'overlay';
  // Percent ticks on the main axes (the marginal axes are bare).
  for (const key of ['xaxis', 'yaxis']) {
    layout[key] = {
      ...(layout[key] as object),
      tickformat: '.0%',
      zeroline: true,
      ...(narrow ? { nticks: 5 } : {}),
    };
  }
  layout['legend'] = {
    ...(layout['legend'] as object),
    orientation: 'h',
    x: 0,
    y: -0.12,
    yanchor: 'top',
  };
  layout['margin'] = { b: 96 };

  const chart: Chart = createChart(chartEl, { ...figure, config: chartConfig(narrow) });
  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
