import { createChart, type Chart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COMMON_RETURNS, fmtDate, rollingVol } from './analysis.mts';
import { chartConfig, frame, isNarrow, settled } from './ui.mts';

/**
 * SOXL's daily return against SOXX's (the unleveraged ETF on a near-identical semiconductor index),
 * built from rows with the Express API: `hx.scatter` with `trendline: 'ols'` (one least-squares
 * line per group), `marginalX` / `marginalY` histograms that share the main plot's axes, and
 * `color` by the market's regime that day — the trailing 21-day volatility of SOXX, calm under 25%
 * a year, volatile from 40%. The fitted slopes come back from `hx.getTrendlineResults(figure)` and
 * go into the legend: about 3.00 in calm markets, about 2.92 in volatile ones, where the daily
 * reset, financing and the index mismatch cost the most. The figure is plain JSON, so the axes get
 * percent ticks with a small edit before `createChart`.
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: SOXL against SOXX by market regime (Express)',
  description:
    'Express scatter of SOXL against SOXX daily returns, colored by volatility regime, with OLS trendlines and marginal histograms.',
  tags: ['demo', 'express', 'scatter', 'trendline', 'ols', 'marginal', 'histogram', 'financial'],
  size: { width: 960, height: 560 },
  testTolerance: 0.004,
};

/** Regimes by SOXX's trailing 21-day annualized volatility. */
const REGIMES = [
  { name: 'Calm (SOXX vol under 25%)', below: 0.25, color: '#128b8b' },
  { name: 'Normal (25–40%)', below: 0.4, color: '#997600' },
  { name: 'Volatile (40% and up)', below: Infinity, color: '#b8267e' },
] as const;

interface DayRow {
  date: string;
  soxx: number;
  soxl: number;
  vol: number;
  regime: string;
}

/** Most days fit in ±7% for SOXX (±21% for SOXL); a few dozen extreme days fall outside. */
const SPAN = 0.07;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const x = COMMON_RETURNS.SOXX;
  const y = COMMON_RETURNS.SOXL;
  const vol = rollingVol(x.r, 21);
  const rows: DayRow[] = [];
  x.r.forEach((r, i) => {
    const v = vol[i];
    if (v === null || v === undefined) return;
    rows.push({
      date: fmtDate(x.dates[i] as string),
      soxx: r,
      soxl: y.r[i] as number,
      vol: v,
      regime: (REGIMES.find((g) => v < g.below) ?? REGIMES[2]).name,
    });
  });

  const figure = hx.scatter(rows, {
    x: 'soxx',
    y: 'soxl',
    color: 'regime',
    colorDiscreteSequence: REGIMES.map((g) => g.color),
    categoryOrders: { regime: REGIMES.map((g) => g.name) },
    trendline: 'ols',
    marginalX: 'histogram',
    marginalY: 'histogram',
    hoverName: 'date',
    hoverData: { soxx: ':+.2%', soxl: ':+.2%', vol: ':.0%', regime: false },
    opacity: 0.7,
    rangeX: [-SPAN, SPAN],
    rangeY: [-3 * SPAN, 3 * SPAN],
    labels: {
      soxx: 'SOXX daily return',
      soxl: 'SOXL daily return',
      vol: 'SOXX 21-day volatility',
      regime: 'Regime',
    },
    title: narrow ? undefined : 'SOXL against SOXX every day since 2010, by volatility regime',
  });

  // The fitted slope of each regime, into its legend name.
  for (const result of hx.getTrendlineResults(figure)) {
    const regime = result.groups['Regime'];
    const slope = result.fit.params[1] as number;
    for (const trace of figure.data) {
      if (trace['name'] === regime) trace['name'] = `${regime}: slope ${slope.toFixed(3)}`;
    }
  }
  // Marginals: stacked, so each bar is all the days in its bin split by regime, in 0.25% bins.
  for (const trace of figure.data) {
    if (trace['type'] !== 'histogram') continue;
    // Express groups the marginal bars side by side (`offsetgroup` per color, as px); one stack.
    delete trace['offsetgroup'];
    delete trace['alignmentgroup'];
    if (trace['x'] !== undefined) trace['xbins'] = { start: -SPAN, end: SPAN, size: SPAN / 28 };
    else trace['ybins'] = { start: -3 * SPAN, end: 3 * SPAN, size: (3 * SPAN) / 28 };
  }
  const layout = figure.layout;
  layout['barmode'] = 'stack';
  layout['bargap'] = 0.1;
  // Percent ticks on the main axes (the marginal axes are bare).
  for (const key of ['xaxis', 'yaxis']) {
    layout[key] = { ...(layout[key] as object), tickformat: '.0%' };
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
