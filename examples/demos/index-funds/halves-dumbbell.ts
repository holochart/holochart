import { createChart, type Chart, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { cagr, ETFS, FUNDS, LABEL, pct, PERIODS, type Ticker } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Every ETF of the demo as a dumbbell: its annualized return in the first half (a teal circle) and
 * in the second (an amber diamond) on a shared horizontal axis, joined by a thin line, one row per
 * fund sorted by the second half's return. The connectors are a single `scatter` trace in
 * `mode: 'lines'` whose segments are separated by `null`s; the two marker traces differ in symbol
 * as well as color. Rows are a category axis in a fixed order (`categoryarray`), with the five
 * main index funds in bold (`ticktext`). The ticker and both numbers are in the hover label.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: every ETF in the two halves',
  description:
    'Annualized return of 27 ETFs in October 2022 – September 2024 and October 2024 – September 2026 as a dumbbell chart sorted by the second half.',
  tags: ['demo', 'scatter', 'markers', 'lines', 'category', 'dumbbell', 'symbols', 'financial'],
  size: { width: 960, height: 720 },
  testTolerance: 0.004,
};

/** Percent ticks from `from` to `to`, signed, with a plain `0%`. */
function pctTicks(
  from: number,
  to: number,
  step: number,
): { tickvals: number[]; ticktext: string[] } {
  const tickvals: number[] = [];
  for (let k = Math.ceil(from / step - 1e-9); k * step <= to + 1e-9; k++) tickvals.push(k * step);
  return { tickvals, ticktext: tickvals.map((v) => (Math.abs(v) < 1e-9 ? '0%' : pct(v))) };
}

interface Row {
  t: Ticker;
  first: number;
  second: number;
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  // Lowest second-half return first: a category axis runs bottom to top.
  const rows: Row[] = ETFS.map((t) => ({
    t,
    first: cagr(t, 'first'),
    second: cagr(t, 'second'),
  })).sort((a, b) => a.second - b.second);
  const names = rows.map((r) => LABEL[r.t]);
  const main = new Set<Ticker>(FUNDS);
  const better = rows.filter((r) => r.second > r.first);
  const all = rows.flatMap((r) => [r.first, r.second]);
  const lo = Math.floor(Math.min(...all) / 0.05) * 0.05;
  const hi = Math.ceil(Math.max(...all) / 0.05) * 0.05;

  const connectors: ScatterTrace = {
    type: 'scatter',
    mode: 'lines',
    name: 'change',
    x: rows.flatMap((r) => [r.first, r.second, null]),
    y: rows.flatMap((r) => [LABEL[r.t], LABEL[r.t], null]),
    line: { color: LOOK.zero, width: 2 },
    hoverinfo: 'skip',
    showlegend: false,
  };
  const half = (key: 'first' | 'second'): ScatterTrace => ({
    type: 'scatter',
    mode: 'markers',
    name: `${PERIODS[key].short}  (${PERIODS[key].label})`,
    x: rows.map((r) => r[key]),
    y: names,
    customdata: rows.map((r) => [
      r.t,
      pct(r.first, 1),
      pct(r.second, 1),
      pct(r.second - r.first, 1),
    ]),
    marker: {
      color: PERIODS[key].color,
      size: key === 'first' ? 9 : 10,
      symbol: key === 'first' ? 'circle' : 'diamond',
      line: { color: LOOK.bg, width: 1 },
    },
    hovertemplate:
      '<b>%{customdata[0]}</b> · %{y}<br>' +
      `${PERIODS.first.short}: %{customdata[1]} a year<br>` +
      `${PERIODS.second.short}: %{customdata[2]} a year<br>` +
      'change: %{customdata[3]} a year<extra></extra>',
  });

  const chart: Chart = createChart(chartEl, {
    data: [connectors, half('first'), half('second')],
    layout: {
      title: {
        text: narrow
          ? ''
          : `Return per year in each half: ${better.length} of ${rows.length} ETFs did better in ${PERIODS.second.short}` +
            (better.length > 0 && better.length <= 3
              ? ` (${better.map((r) => r.t).join(', ')})`
              : ''),
      },
      hovermode: 'closest',
      legend: { orientation: 'h', x: 0, y: 1.01, yanchor: 'bottom' },
      margin: { l: narrow ? 118 : 150, r: narrow ? 12 : 28, t: narrow ? 40 : 72, b: 44 },
      xaxis: {
        title: { text: 'Return per year, dividends reinvested' },
        ...pctTicks(lo, hi, narrow ? 0.1 : 0.05),
        range: [lo - 0.02, hi + 0.02],
        zeroline: true,
        zerolinecolor: LOOK.tick,
        zerolinewidth: 1,
      },
      yaxis: {
        type: 'category',
        categoryorder: 'array',
        categoryarray: names,
        tickvals: names,
        ticktext: rows.map((r) => (main.has(r.t) ? `<b>${LABEL[r.t]}</b>` : LABEL[r.t])),
        tickfont: { size: narrow ? 9 : 10 },
        range: [-0.7, rows.length - 0.3],
        gridcolor: LOOK.grid,
      },
    },
    config: chartConfig(narrow),
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
