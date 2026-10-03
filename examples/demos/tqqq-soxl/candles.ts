import { createChart, type Chart, type FigureInput } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLOR, DOWN, type Fund, OHLCV, sma, UP } from './analysis.mts';
import { chartConfig, frame, fundPicker, isNarrow, settled } from './ui.mts';

/**
 * Six months of daily candlesticks for one fund (SOXL to start, a toolbar toggle switches to TQQQ
 * with `chart.react`), with its 20- and 50-day simple moving averages, computed on the year before
 * the window too so both lines start at the left edge. A volume subplot sits underneath on the same
 * x axis (`xaxis.anchor: 'y2'`, two y domains), each bar colored by the day's direction. Range
 * breaks hide weekends (`bounds: ['sat', 'mon']`) and the market holidays (`values`, every weekday
 * missing from the data), so sessions sit side by side; the range slider under the volume panel
 * zooms both panels at once. Prices are split-adjusted, not dividend-adjusted.
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: daily candles, moving averages and volume',
  description:
    'Six months of daily candlesticks with 20- and 50-day moving averages, a volume subplot colored by direction, weekend and holiday range breaks and a range slider.',
  tags: [
    'demo',
    'candlestick',
    'financial',
    'bar',
    'scatter',
    'subplots',
    'rangebreaks',
    'rangeslider',
    'date',
    'react',
  ],
  size: { width: 960, height: 540 },
  testTolerance: 0.004,
};

/** Sessions shown: about six months. */
const SESSIONS = 126;
const DAY = 86_400_000;
/** The 20-day line: a light gold that reads apart from both fund hues and from UP / DOWN. */
const SMA20 = '#d8b45a';

/** Weekdays between the first and last date that are not in the data: the market holidays. */
function holidays(dates: readonly string[]): string[] {
  const have = new Set(dates);
  const out: string[] = [];
  const end = Date.parse(dates[dates.length - 1] as string);
  for (let t = Date.parse(dates[0] as string); t <= end; t += DAY) {
    const d = new Date(t);
    const dow = d.getUTCDay();
    const iso = d.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !have.has(iso)) out.push(iso);
  }
  return out;
}

function figure(fund: Fund, narrow: boolean): FigureInput {
  const o = OHLCV[fund];
  const n = o.date.length;
  const from = n - SESSIONS;
  const cut = <T>(v: readonly T[]): T[] => v.slice(from);
  const x = cut(o.date);
  const open = cut(o.open);
  const high = cut(o.high);
  const low = cut(o.low);
  const close = cut(o.close);
  const volume = cut(o.volume);
  // Change from the previous close, for the hover label.
  const change = close.map((c, i) => c / (o.close[from + i - 1] as number) - 1);
  const up = close.map((c, i) => c >= (open[i] as number));
  const date = '%{x|%a %b %-d, %Y}';
  const lo = Math.min(...low);
  const hi = Math.max(...high);

  return {
    data: [
      {
        type: 'candlestick',
        name: fund,
        x,
        open,
        high,
        low,
        close,
        customdata: change,
        increasing: { line: { color: UP }, fillcolor: UP },
        decreasing: { line: { color: DOWN }, fillcolor: DOWN },
        hovertemplate:
          `${date}<br>Open %{open:$.2f}  High %{high:$.2f}<br>` +
          `Low %{low:$.2f}  Close %{close:$.2f}<br>Day %{customdata:+.1%}<extra>${fund}</extra>`,
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: '20-day average',
        x,
        y: cut(sma(o.close, 20)),
        line: { color: SMA20, width: 1.25 },
        hovertemplate: `20-day %{y:$.2f}<extra></extra>`,
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: '50-day average',
        x,
        y: cut(sma(o.close, 50)),
        line: { color: COLOR[fund === 'TQQQ' ? 'QQQ' : 'SOXX'], width: 1.25, dash: 'dot' },
        hovertemplate: `50-day %{y:$.2f}<extra></extra>`,
      },
      {
        type: 'bar',
        name: 'Volume',
        x,
        y: volume,
        yaxis: 'y2',
        marker: { color: up.map((u) => (u ? UP : DOWN)), opacity: 0.75 },
        showlegend: false,
        hovertemplate: `${date}<br>Volume %{y:.3s} shares<extra></extra>`,
      },
    ],
    layout: {
      title: { text: narrow ? '' : `${fund}: daily candles, last six months` },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      hovermode: 'x',
      bargap: 0.25,
      xaxis: {
        type: 'date',
        anchor: 'y2',
        // Thumbnail: the candles in its upper part, volume along the bottom, so they do not overlap.
        rangeslider: {
          visible: true,
          thickness: 0.08,
          yaxis: { rangemode: 'fixed', range: [lo - (hi - lo) * 0.7, hi] },
          yaxis2: { rangemode: 'fixed', range: [0, Math.max(...volume) * 3] },
        },
        rangebreaks: [{ bounds: ['sat', 'mon'] }, { values: holidays(o.date) }],
      },
      yaxis: { domain: [0.32, 1], title: { text: 'Price (USD)' }, tickprefix: '$' },
      yaxis2: { domain: [0, 0.22], title: { text: 'Volume' }, tickformat: '~s', nticks: 3 },
    },
    config: chartConfig(narrow),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const chart: Chart = createChart(chartEl, figure('SOXL', narrow));
  fundPicker(toolbar, (fund) => void chart.react(figure(fund, narrow)), 'SOXL');

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
