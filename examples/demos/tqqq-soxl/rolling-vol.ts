import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  COLOR,
  COMMON_RETURNS,
  COMMON_START,
  DASH,
  fmtDate,
  pct,
  rollingVol,
  stdev,
  TICKERS,
  UNDERLYING,
  type Ticker,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, segmented, settled } from './ui.mts';

/**
 * Rolling annualized volatility of TQQQ, SOXL and their unleveraged references (QQQ, SOXX) since
 * March 2010: the standard deviation of daily returns over a trailing 21- or 63-trading-day window,
 * times √252. Dotted horizontal `shapes` mark each ticker's long-run volatility (over the whole
 * period), labelled by `annotations` in the right margin; an arrow annotation points at SOXL's
 * peak. On the default log y axis a fixed ratio is a fixed gap, so the 3× funds run a constant
 * distance above their references. Two toolbar toggles rebuild the figure with `chart.react(…)`:
 * the window (21 or 63 days) and the axis type (log or linear).
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: rolling volatility',
  description:
    '21- or 63-day rolling annualized volatility of TQQQ, SOXL, QQQ and SOXX since 2010, with each long-run average marked: the 3× funds run about three times as volatile.',
  tags: ['demo', 'line', 'log', 'date', 'shapes', 'annotations', 'react', 'hover', 'financial'],
  size: { width: 960, height: 420 },
  testTolerance: 0.004,
};

type Window = '21' | '63';
type AxisType = 'log' | 'linear';

/** Long-run annualized volatility of each ticker over the whole common period. */
const LONG_RUN = Object.fromEntries(
  TICKERS.map((t) => [t, stdev(COMMON_RETURNS[t].r) * Math.sqrt(252)]),
) as Record<Ticker, number>;

/** Rolling volatility per ticker, computed once per window. */
const cache = new Map<Window, Record<Ticker, (number | null)[]>>();
function vols(window: Window): Record<Ticker, (number | null)[]> {
  let v = cache.get(window);
  if (!v) {
    v = Object.fromEntries(
      TICKERS.map((t) => [t, rollingVol(COMMON_RETURNS[t].r, Number(window))]),
    ) as Record<Ticker, (number | null)[]>;
    cache.set(window, v);
  }
  return v;
}

/** Index and value of the largest entry. */
function peak(values: readonly (number | null)[]): { i: number; v: number } {
  let best = { i: 0, v: -Infinity };
  values.forEach((v, i) => {
    if (v !== null && v > best.v) best = { i, v };
  });
  return best;
}

function figure(window: Window, axis: AxisType, narrow: boolean): Record<string, unknown> {
  const v = vols(window);
  const log = axis === 'log';
  const yOf = (value: number): number => (log ? Math.log10(value) : value);

  const traces = TICKERS.map((t) => {
    const fund = t === 'TQQQ' || t === 'SOXL';
    return {
      type: 'scatter',
      mode: 'lines',
      name: t,
      x: COMMON_RETURNS[t].dates,
      y: v[t],
      line: { color: COLOR[t], width: fund ? 1.5 : 1.1, dash: DASH[t] },
      hovertemplate: `${t}  %{y:.1%}<extra></extra>`,
    };
  });

  // Long-run levels: a dotted rule across the plot, labelled in the right margin.
  const shapes = TICKERS.map((t) => ({
    type: 'line',
    xref: 'paper',
    x0: 0,
    x1: 1,
    yref: 'y',
    y0: LONG_RUN[t],
    y1: LONG_RUN[t],
    layer: 'below',
    line: { color: COLOR[t], width: 1, dash: 'dot' },
  }));
  const levels = TICKERS.map((t) => {
    const fund = t === 'TQQQ' || t === 'SOXL';
    const ratio = fund ? ` (${(LONG_RUN[t] / LONG_RUN[UNDERLYING[t]]).toFixed(1)}×)` : '';
    return {
      xref: 'paper',
      x: 1,
      yref: 'y',
      y: yOf(LONG_RUN[t]),
      text: narrow ? pct(LONG_RUN[t], 0, false) : `${t} ${pct(LONG_RUN[t], 0, false)}${ratio}`,
      showarrow: false,
      xanchor: 'left',
      xshift: 4,
      font: { color: COLOR[t], size: 9 },
    };
  });

  const top = peak(v.SOXL);
  const topDate = COMMON_RETURNS.SOXL.dates[top.i] as string;
  const peakNote = {
    x: topDate,
    y: yOf(top.v),
    xref: 'x',
    yref: 'y',
    text: `SOXL ${pct(top.v, 0, false)}, ${fmtDate(topDate)}`,
    showarrow: true,
    arrowhead: 0,
    arrowwidth: 1,
    arrowcolor: COLOR.SOXL,
    ax: 60,
    ay: 0,
    xanchor: 'left',
    font: { color: COLOR.SOXL, size: 9 },
  };

  return {
    data: traces,
    layout: {
      title: {
        text: narrow
          ? ''
          : `${window}-day rolling volatility, annualized, since ${fmtDate(COMMON_START)}`,
      },
      hovermode: 'x unified',
      margin: { r: narrow ? 44 : 104 },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: { type: 'date' },
      yaxis: {
        type: axis,
        title: { text: `Annualized volatility${log ? ' (log scale)' : ''}` },
        tickformat: '.0%',
        ...(log ? { tickvals: [0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 3] } : { rangemode: 'tozero' }),
      },
      shapes,
      annotations: [...levels, peakNote],
    },
    config: chartConfig(narrow),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  let window: Window = '63';
  let axis: AxisType = 'log';

  const chart: Chart = createChart(chartEl, figure(window, axis, narrow));
  const redraw = (): void => {
    void chart.react(figure(window, axis, narrow));
  };

  segmented<Window>(
    toolbar,
    'Window',
    [
      { value: '21', text: '21 days' },
      { value: '63', text: '63 days' },
    ],
    (value) => {
      window = value;
      redraw();
    },
    window,
  );
  segmented<AxisType>(
    toolbar,
    'Y axis',
    [
      { value: 'log', text: 'Log' },
      { value: 'linear', text: 'Linear' },
    ],
    (value) => {
      axis = value;
      redraw();
    },
    axis,
  );

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
