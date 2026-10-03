import { createChart, type Chart, type FigureInput } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { DOWN, type Fund, fmtDate, INTRADAY, pct, UP } from './analysis.mts';
import { chartConfig, frame, fundPicker, isNarrow, settled } from './ui.mts';

/**
 * The last five sessions in 5-minute OHLC bars (`type: 'ohlc'`), regular hours only, for one fund
 * (SOXL to start; the toolbar toggle swaps the figure with `chart.react`). Two range breaks hide
 * the nights (`pattern: 'hour'`, `bounds: [16, 9.5]`, wrapping past midnight) and the weekend
 * (`bounds: ['sat', 'mon']`), so the five sessions sit side by side at the same width. A line per
 * session follows its VWAP (volume-weighted average price, restarting at each open; the line
 * breaks between sessions on `null`s), and a dotted line marks the close before the first session.
 * Times are New York exchange time, given as plain date strings, so the hour pattern reads them
 * as they are.
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: five sessions in 5-minute bars',
  description:
    'Five days of 5-minute OHLC bars with nights and the weekend removed by range breaks, a VWAP line per session and the previous close.',
  tags: ['demo', 'ohlc', 'financial', 'intraday', 'rangebreaks', 'scatter', 'date', 'react'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

const VWAP = '#d8b45a';
const PREV = '#a4a7b5';
const DAY = 86_400_000;

/** VWAP from each session's open, with a `null` between sessions so the line breaks there. */
function vwap(fund: Fund): { x: string[]; y: (number | null)[] } {
  const d = INTRADAY[fund];
  const x: string[] = [];
  const y: (number | null)[] = [];
  let day = '';
  let pv = 0;
  let v = 0;
  d.time.forEach((t, i) => {
    if (t.slice(0, 10) !== day) {
      if (day !== '') {
        x.push(t);
        y.push(null);
      }
      day = t.slice(0, 10);
      pv = 0;
      v = 0;
    }
    const typical = ((d.high[i] as number) + (d.low[i] as number) + (d.close[i] as number)) / 3;
    pv += typical * (d.volume[i] as number);
    v += d.volume[i] as number;
    x.push(t);
    y.push(v > 0 ? pv / v : typical);
  });
  return { x, y };
}

/** The weekday before `iso` (holidays aside): the session the previous close belongs to. */
function weekdayBefore(iso: string): string {
  let t = Date.parse(iso) - DAY;
  while ([0, 6].includes(new Date(t).getUTCDay())) t -= DAY;
  return new Date(t).toISOString().slice(0, 10);
}

function figure(fund: Fund, narrow: boolean): FigureInput {
  const d = INTRADAY[fund];
  const first = d.time[0] as string;
  const last = d.time[d.time.length - 1] as string;
  const prevDay = fmtDate(weekdayBefore(first.slice(0, 10))).replace(/, \d{4}$/, '');
  const change = (d.close[d.close.length - 1] as number) / d.previousClose - 1;
  const line = vwap(fund);

  return {
    data: [
      {
        type: 'ohlc',
        name: fund,
        x: d.time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        increasing: { line: { color: UP, width: 1 } },
        decreasing: { line: { color: DOWN, width: 1 } },
        tickwidth: 0.3,
        hovertemplate:
          '%{x|%a %b %-d, %H:%M}<br>Open %{open:$.2f}  High %{high:$.2f}<br>' +
          `Low %{low:$.2f}  Close %{close:$.2f}<extra>${fund}</extra>`,
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'VWAP (per session)',
        x: line.x,
        y: line.y,
        line: { color: VWAP, width: 1.5 },
        hovertemplate: 'VWAP %{y:$.2f}<extra></extra>',
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: `Close on ${prevDay}: $${d.previousClose.toFixed(2)}`,
        x: [first, last],
        y: [d.previousClose, d.previousClose],
        line: { color: PREV, width: 1, dash: 'dot' },
        hoverinfo: 'skip',
      },
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : `${fund}: last five sessions in 5-minute bars, ${pct(change)} from the previous close`,
      },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      hovermode: 'x',
      xaxis: {
        type: 'date',
        rangeslider: { visible: false },
        rangebreaks: [{ bounds: ['sat', 'mon'] }, { pattern: 'hour', bounds: [16, 9.5] }],
        tickformat: '%a %b %-d',
        hoverformat: '%a %b %-d, %H:%M',
      },
      yaxis: { title: { text: 'Price (USD)' }, tickprefix: '$' },
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
