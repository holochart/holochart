import { createChart, type Chart, type IndicatorTrace, type LayoutShape } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  BASE,
  COLOR,
  CORE,
  DOWN,
  fmtDate,
  HALVES,
  LABEL,
  LAST_DATE,
  OHLCV,
  pct,
  PERIODS,
  SPLIT,
  SPLIT_DATE,
  totalReturn,
  type Traded,
  UP,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Where the four funds with different indexes stand at the end of the four years: a KPI panel of
 * `indicator` traces in the cells of a `layout.grid` (`domain.row` / `domain.column`), one column
 * per fund. The top row is the last close as traded with a relative `delta` against the close at
 * the split (Sep 30, 2024), so the delta is the second half's price change. The bottom row is the
 * four-year total return (dividends reinvested), with each half's return in its color in the
 * card's title. Column headings are paper-referenced annotations in the fund's color. Narrow
 * containers (phones) get a 2 × 2 grid of the price cards, with the four-year return in the title.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: where the four funds ended',
  description:
    'The last close of SPY, QQQ, DIA and IWM with its change since the split of the four years, and the four-year total return of each.',
  tags: ['demo', 'indicator', 'kpi', 'dashboard', 'grid', 'delta', 'financial'],
  size: { width: 960, height: 320 },
  testTolerance: 0.004,
};

const small = (s: string, color: string = LOOK.text): string =>
  `<span style="font-size:0.9em;color:${color}">${s}</span>`;
const tinted = (s: string, color: string): string => `<span style="color:${color}">${s}</span>`;

/** The price card and the total-return card of one fund. */
function cards(t: Traded, column: number, narrow: boolean): IndicatorTrace[] {
  const { close } = OHLCV[t];
  const last = close.at(-1) as number;
  const atSplit = close[SPLIT - BASE] as number;
  const four = totalReturn(t, 'all');
  // Each half's return in its color (sibling spans: one style attribute each).
  const halves = HALVES.map((half) =>
    small(`${PERIODS[half].short} ${pct(totalReturn(t, half))}`, PERIODS[half].color),
  ).join(small(' · '));
  const price: IndicatorTrace = {
    type: 'indicator',
    mode: 'number+delta',
    name: `${t} last close`,
    value: last,
    number: { prefix: '$', valueformat: ',.2f', font: { size: narrow ? 22 : 32 } },
    delta: {
      reference: atSplit,
      relative: true,
      valueformat: '.1%',
      suffix: narrow ? '' : ` since ${fmtDate(SPLIT_DATE)}`,
      // A sign instead of the default triangles, which the built-in font lacks (they would be
      // fetched as a fallback font).
      increasing: { color: UP, symbol: '+' },
      decreasing: { color: DOWN, symbol: '−' },
      font: { size: narrow ? 11 : 12 },
    },
    title: {
      text: narrow
        ? `${tinted(`<b>${t}</b>`, COLOR[t])} ${LABEL[t]}<br>${small(`four years ${pct(four)}`)}`
        : `${tinted(`<b>${t}</b>`, COLOR[t])}  ${LABEL[t]}`,
      font: { size: narrow ? 11 : 15 },
    },
    domain: narrow ? { row: Math.floor(column / 2), column: column % 2 } : { row: 0, column },
  };
  if (narrow) return [price];
  return [
    price,
    {
      type: 'indicator',
      mode: 'number',
      name: `${t} four-year total return`,
      // In percent, so the number reads "+125%".
      value: four * 100,
      number: {
        valueformat: '+.0f',
        suffix: '%',
        font: { size: 26, color: four >= 0 ? UP : DOWN },
      },
      title: { text: `Four-year total return<br>${halves}`, font: { size: 12 } },
      domain: { row: 1, column },
    },
  ];
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  // Hairlines between the columns.
  const rules = CORE.slice(1).map((_, i): LayoutShape => ({
    type: 'line',
    xref: 'paper',
    yref: 'paper',
    x0: (i + 1) / CORE.length,
    x1: (i + 1) / CORE.length,
    y0: 0,
    y1: 1,
    line: { color: LOOK.axis, width: 1 },
  }));

  const chart: Chart = createChart(chartEl, {
    data: CORE.flatMap((t, i) => cards(t as Traded, i, narrow)),
    layout: {
      title: {
        text: narrow ? '' : `The four funds on ${fmtDate(LAST_DATE)}, the end of the four years`,
      },
      grid: narrow
        ? { rows: 2, columns: 2, pattern: 'independent', xgap: 0.1, ygap: 0.3 }
        : { rows: 2, columns: 4, pattern: 'independent', xgap: 0.12, ygap: 0.12 },
      margin: { l: 16, r: 16, t: narrow ? 16 : 56, b: 12 },
      shapes: narrow ? [] : rules,
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
