import {
  createChart,
  type Chart,
  type HeatmapTrace,
  type LayoutAnnotation,
  type LayoutShape,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  FUNDS,
  type Half,
  LABEL,
  MONTH_SPANS,
  monthlyReturns,
  pct,
  PERIODS,
  RETURN_SCALE,
  STYLES,
  type Ticker,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Every month of the four years for nine funds as a heatmap: a column per month (48), a row per
 * fund, the five main index funds on top and the four size and style funds under them (two
 * `heatmap` traces on stacked y axes sharing the x axis, so the groups stand apart). Cells take
 * the diverging `RETURN_SCALE`, centered on 0 and capped at ±12% (`zmin` / `zmax`), with small
 * gaps between them (`xgap`, `ygap`). A line between September and October 2024 divides the two
 * halves, which are named above the grid over a rule in each half's color (shapes and annotations
 * placed by column position). Hover (`hovertext`) gives the fund, the month and the return.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: monthly returns',
  description:
    'Monthly total returns of five index funds and four style funds from October 2022 to September 2026 as a heatmap, with the two halves divided.',
  tags: ['demo', 'heatmap', 'colorbar', 'subplots', 'shapes', 'annotations', 'financial'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

/** Colors saturate at ±12% a month. */
const CAP = 0.12;
/** Gap between the two groups of rows, and the height of one row, in fractions of the plot. */
const GROUP_GAP = 0.05;
const ROW = (1 - GROUP_GAP) / (FUNDS.length + STYLES.length);
/** The first month of the second half, as a column position. */
const SPLIT_AT = MONTH_SPANS.findIndex((m) => m.half === 'second');
const COLUMNS = MONTH_SPANS.map((_, i) => i);

function rows(
  tickers: readonly Ticker[],
  axis: 'y' | 'y2',
  narrow: boolean,
  scale: boolean,
): HeatmapTrace {
  const z = tickers.map((t) => monthlyReturns(t));
  return {
    type: 'heatmap',
    name: axis === 'y' ? 'Index funds' : 'Style funds',
    xaxis: 'x',
    yaxis: axis,
    x: COLUMNS,
    y: tickers.map((t) => (narrow ? t : `${t} · ${LABEL[t]}`)),
    z,
    hovertext: tickers.map((t, j) =>
      MONTH_SPANS.map(
        (m, i) =>
          `<b>${t}</b> · ${LABEL[t]}<br>${m.label}: <b>${pct(z[j]?.[i] ?? 0, 1)}</b><br>` +
          `<i>${PERIODS[m.half].short}</i>`,
      ),
    ),
    hovertemplate: '%{hovertext}<extra></extra>',
    colorscale: RETURN_SCALE,
    zmin: -CAP,
    zmax: CAP,
    xgap: narrow ? 1 : 2,
    ygap: 2,
    showscale: scale,
    colorbar: {
      title: { text: 'Monthly<br>return' },
      tickvals: [-0.12, -0.06, 0, 0.06, 0.12],
      ticktext: ['≤ −12%', '−6%', '0%', '+6%', '≥ +12%'],
      thickness: 12,
      len: 1,
    },
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const n = MONTH_SPANS.length;

  // A tick every third month (Oct, Jan, Apr, Jul), with the year under each January and the first.
  const tickvals = COLUMNS.filter((i) => i % 3 === 0);
  const ticktext = tickvals.map((i) => {
    const [month, year] = (MONTH_SPANS[i]?.label ?? '').split(' ');
    if (narrow) return month === 'Jan' ? `’${(year ?? '').slice(2)}` : '';
    return month === 'Jan' || i === 0 ? `${month}<br>${year}` : (month ?? '');
  });

  const headY = 1.025;
  const halfRule = (x0: number, x1: number, half: Half): LayoutShape => ({
    type: 'line',
    xref: 'x',
    yref: 'paper',
    x0,
    x1,
    y0: headY,
    y1: headY,
    line: { color: PERIODS[half].color, width: 2 },
  });
  const halfName = (x: number, half: Half): LayoutAnnotation => ({
    xref: 'x',
    yref: 'paper',
    x,
    y: headY,
    xanchor: 'center',
    yanchor: 'bottom',
    yshift: 3,
    showarrow: false,
    text: narrow
      ? `<b>${PERIODS[half].short}</b>`
      : `<b>${PERIODS[half].short}</b>  ${PERIODS[half].label}`,
    font: { color: PERIODS[half].color, size: 11 },
  });

  const chart: Chart = createChart(chartEl, {
    data: [rows(FUNDS, 'y', narrow, true), rows(STYLES, 'y2', narrow, false)],
    layout: {
      title: { text: narrow ? '' : 'Monthly total returns, October 2022 – September 2026' },
      margin: { t: narrow ? 34 : 76, l: narrow ? 40 : 158, r: narrow ? 58 : 76, b: 40 },
      xaxis: {
        anchor: 'y2',
        range: [-0.5, n - 0.5],
        tickvals,
        ticktext,
        showgrid: false,
        zeroline: false,
        ticks: '',
        fixedrange: true,
      },
      yaxis: {
        domain: [1 - ROW * FUNDS.length, 1],
        type: 'category',
        autorange: 'reversed',
        showgrid: false,
        ticks: '',
        fixedrange: true,
      },
      yaxis2: {
        domain: [0, ROW * STYLES.length],
        anchor: 'x',
        type: 'category',
        autorange: 'reversed',
        showgrid: false,
        ticks: '',
        fixedrange: true,
      },
      shapes: [
        halfRule(-0.5, SPLIT_AT - 0.5 - 0.2, 'first'),
        halfRule(SPLIT_AT - 0.5 + 0.2, n - 0.5, 'second'),
        {
          type: 'line',
          xref: 'x',
          yref: 'paper',
          x0: SPLIT_AT - 0.5,
          x1: SPLIT_AT - 0.5,
          y0: 0,
          y1: headY,
          line: { color: LOOK.title, width: 1.5 },
        },
      ],
      annotations: [
        halfName((SPLIT_AT - 1) / 2, 'first'),
        halfName((SPLIT_AT + n - 1) / 2, 'second'),
      ],
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
