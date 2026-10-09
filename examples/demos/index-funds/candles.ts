import { createChart, type Chart, type FigureInput } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLOR, CORE, DOWN, LABEL, OHLCV, resample, type Traded, UP } from './analysis.mts';
import {
  chartConfig,
  frame,
  fundPicker,
  halfLabels,
  halfShapes,
  isNarrow,
  settled,
} from './ui.mts';

/**
 * Four years of weekly candlesticks for one fund (SPY to start; the toolbar's fund picker swaps it
 * with `chart.react`), each candle dated at its week's Monday, with the 10- and 40-week simple
 * moving averages of the weekly close (`resample` merges the daily bars). The data has no bars before the four years, so each average
 * starts once its window is full. A volume subplot sits underneath on the same x axis
 * (`xaxis.anchor: 'y2'`, two y domains), each bar colored by the week's direction. Range selector
 * buttons (`xaxis.rangeselector`) jump to the last 6 months, 1 year, 2 years or everything, and
 * the range slider under the volume panel pans and zooms both panels. The two halves are marked
 * in both panels (`halfShapes`). Prices are as traded: split-adjusted, not dividend-adjusted.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: weekly candles, moving averages and volume',
  description:
    'Four years of weekly candlesticks with 10- and 40-week moving averages, a volume subplot, range selector buttons, a range slider and a fund picker.',
  tags: [
    'demo',
    'candlestick',
    'bar',
    'scatter',
    'subplots',
    'rangeselector',
    'rangeslider',
    'date',
    'shapes',
    'react',
    'financial',
  ],
  size: { width: 960, height: 540 },
  testTolerance: 0.004,
};

/** The 10-week line: a light gold that reads apart from the fund hues and from UP / DOWN. */
const FAST = '#d8b45a';

/** The Monday of a date's week, `YYYY-MM-DD`. */
function monday(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

/** Simple moving average over the trailing `n` values; `null` until the window is full. */
function sma(v: readonly number[], n: number): (number | null)[] {
  let sum = 0;
  return v.map((x, i) => {
    sum += x - (i >= n ? (v[i - n] as number) : 0);
    return i >= n - 1 ? sum / n : null;
  });
}

function figure(t: Traded, narrow: boolean): FigureInput {
  const w = resample(OHLCV[t], 'week');
  const x = w.date.map(monday);
  const change = w.close.map(
    (c, i) => c / (i ? (w.close[i - 1] as number) : OHLCV[t].close[0]!) - 1,
  );
  const up = w.close.map((c, i) => c >= (w.open[i] as number));
  const lo = Math.min(...w.low);
  const hi = Math.max(...w.high);
  const week = 'Week of %{x|%b %-d, %Y}';

  return {
    data: [
      {
        type: 'candlestick',
        name: t,
        x,
        open: [...w.open],
        high: [...w.high],
        low: [...w.low],
        close: [...w.close],
        customdata: change,
        increasing: { line: { color: UP, width: 1 }, fillcolor: UP },
        decreasing: { line: { color: DOWN, width: 1 }, fillcolor: DOWN },
        hovertemplate:
          `${week}<br>Open %{open:$.2f}  High %{high:$.2f}<br>` +
          `Low %{low:$.2f}  Close %{close:$.2f}<br>Week %{customdata:+.1%}<extra>${t}</extra>`,
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: '10-week average',
        x,
        y: sma(w.close, 10),
        line: { color: FAST, width: 1.25 },
        hovertemplate: '10-week %{y:$.2f}<extra></extra>',
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: '40-week average',
        x,
        y: sma(w.close, 40),
        line: { color: COLOR[t], width: 1.5, dash: 'dot' },
        hovertemplate: '40-week %{y:$.2f}<extra></extra>',
      },
      {
        type: 'bar',
        name: 'Volume',
        x,
        y: [...w.volume],
        yaxis: 'y2',
        marker: { color: up.map((u) => (u ? UP : DOWN)), opacity: 0.75 },
        showlegend: false,
        hovertemplate: `${week}<br>Volume %{y:.3s} shares<extra></extra>`,
      },
    ],
    layout: {
      title: { text: narrow ? '' : `${t} (${LABEL[t]}): weekly candles over the four years` },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      hovermode: 'x',
      bargap: 0.3,
      margin: { t: narrow ? 88 : 70 },
      xaxis: {
        type: 'date',
        anchor: 'y2',
        rangeselector: {
          // Right of the legend; on phones on a row of its own above it.
          x: 1,
          xanchor: 'right',
          y: narrow ? 1.17 : 1.02,
          yanchor: 'bottom',
          buttons: [
            { count: 6, label: '6m', step: 'month', stepmode: 'backward' },
            { count: 1, label: '1y', step: 'year', stepmode: 'backward' },
            { count: 2, label: '2y', step: 'year', stepmode: 'backward' },
            { step: 'all', label: 'All' },
          ],
        },
        // Thumbnail: the candles in its upper part, volume along the bottom, so they do not overlap.
        rangeslider: {
          visible: true,
          thickness: 0.08,
          yaxis: { rangemode: 'fixed', range: [lo - (hi - lo) * 0.7, hi] },
          yaxis2: { rangemode: 'fixed', range: [0, Math.max(...w.volume) * 3] },
        },
      },
      yaxis: { domain: [0.32, 1], title: { text: 'Price (USD)' }, tickprefix: '$' },
      yaxis2: { domain: [0, 0.22], title: { text: 'Shares a week' }, tickformat: '~s', nticks: 3 },
      shapes: [...halfShapes('x', 'y domain'), ...halfShapes('x', 'y2 domain')],
      annotations: halfLabels('x', 'y domain'),
    },
    config: chartConfig(narrow),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const chart: Chart = createChart(chartEl, figure('SPY', narrow));
  fundPicker<Traded>(
    toolbar,
    (fund) => void chart.react(figure(fund, narrow)),
    CORE as readonly Traded[],
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
