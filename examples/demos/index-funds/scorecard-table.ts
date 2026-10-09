import { createChart, type Chart, type LayoutAnnotation, type LayoutShape } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  COLOR,
  fmtDate,
  FUNDS,
  HALVES,
  LABEL,
  pct,
  PERIODS,
  share,
  stats,
  type Stats,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The two halves as a scorecard: a `table` trace with two rows per fund (2022–24 in teal, 2024–26
 * in amber) and, in columns, the total return, the return per year, the annualized volatility,
 * return over volatility, the deepest drawdown from a high made inside the half, the best and the
 * worst day with their dates, and the share of sessions that closed up. Font color, weight and
 * fill are set per cell (nested arrays): the fund's name takes its color, the period its half's
 * color, and of each fund's two rows the better figure is bold. Paper-referenced `annotations`
 * and `shapes` name the three column groups over a rule and carry the footnote. Narrow containers
 * keep the total return, volatility and drawdown.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: scorecard of the two halves',
  description:
    'A table comparing October 2022 – September 2024 with October 2024 – September 2026 for five index funds: return, volatility, drawdown, best and worst day and share of up days.',
  tags: ['demo', 'table', 'annotations', 'shapes', 'style', 'financial'],
  size: { width: 960, height: 490 },
  testTolerance: 0.004,
};

interface Column {
  group: 'Return' | 'Risk' | 'Days';
  name: string;
  short: string;
  width: number;
  text: (s: Stats) => string;
  /** The figure that decides which half was better, and whether higher is better. */
  score?: (s: Stats) => number;
  narrow?: boolean;
}

const COLUMNS: readonly Column[] = [
  {
    group: 'Return',
    name: 'Total return',
    short: 'Return',
    width: 1,
    text: (s) => pct(s.totalReturn, 1),
    score: (s) => s.totalReturn,
    narrow: true,
  },
  {
    group: 'Return',
    name: 'Per year',
    short: 'Per year',
    width: 0.9,
    text: (s) => pct(s.cagr, 1),
    score: (s) => s.cagr,
  },
  {
    group: 'Risk',
    name: 'Volatility',
    short: 'Vol.',
    width: 0.9,
    text: (s) => share(s.vol, 1),
    score: (s) => -s.vol,
    narrow: true,
  },
  {
    group: 'Risk',
    name: 'Return / vol.',
    short: 'Ratio',
    width: 1,
    text: (s) => s.ratio.toFixed(2),
    score: (s) => s.ratio,
  },
  {
    group: 'Risk',
    name: 'Deepest drawdown',
    short: 'Max DD',
    width: 1.25,
    text: (s) => pct(s.maxDrawdown, 1),
    score: (s) => s.maxDrawdown,
    narrow: true,
  },
  {
    group: 'Days',
    name: 'Best day',
    short: 'Best',
    width: 1.75,
    text: (s) => `${fmtDate(s.best.date)}  ${pct(s.best.r, 1)}`,
  },
  {
    group: 'Days',
    name: 'Worst day',
    short: 'Worst',
    width: 1.75,
    text: (s) => `${fmtDate(s.worst.date)}  ${pct(s.worst.r, 1)}`,
  },
  {
    group: 'Days',
    name: 'Up days',
    short: 'Up',
    width: 0.8,
    text: (s) => share(s.upShare, 1),
    score: (s) => s.upShare,
  },
];

const DIM = '#80838f';
/**
 * Row height: what a cell whose text has a space or an `&` needs (such cells may wrap, so their row
 * grows to the text block plus the cell padding, as in Plotly), declared so every row matches.
 */
const ROW_HEIGHT = 30;
/** Row fills alternate by fund, so each fund's two rows read as a pair. */
const PAIR_FILL = [LOOK.bg, '#12121a'] as const;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const shown = COLUMNS.filter((c) => !narrow || c.narrow);

  const rows = FUNDS.flatMap((t, f) =>
    HALVES.map((half, h) => ({ t, f, half, first: h === 0, s: stats(t, half) })),
  );
  const other = (row: (typeof rows)[number]): Stats =>
    stats(row.t, row.half === 'first' ? 'second' : 'first');
  const fill = rows.map((r) => PAIR_FILL[r.f % 2] as string);

  const values: string[][] = [
    rows.map((r) => (r.first ? (narrow ? `<b>${r.t}</b>` : `<b>${r.t}</b>  ${LABEL[r.t]}`) : '')),
    rows.map((r) => PERIODS[r.half].short),
    ...shown.map((c) => rows.map((r) => c.text(r.s))),
  ];
  const fontColor: string[][] = [
    rows.map((r) => COLOR[r.t]),
    rows.map((r) => PERIODS[r.half].color),
    ...shown.map(() => rows.map(() => LOOK.title as string)),
  ];
  const fontWeight: ('normal' | 'bold')[][] = [
    rows.map(() => 'normal'),
    rows.map(() => 'normal'),
    ...shown.map((c) =>
      rows.map((r) => {
        const score = c.score;
        return score && score(r.s) > score(other(r)) ? 'bold' : 'normal';
      }),
    ),
  ];
  const lead = narrow ? [0.7, 0.9] : [1.9, 0.9];
  const columnwidth = [...lead, ...shown.map((c) => c.width)];
  const sum = columnwidth.reduce((a, b) => a + b, 0);
  const tableTop = 0.93;
  // The rules sit just above the table's own top border.
  const ruleY = tableTop + 0.014;

  // Group labels over the statistic columns, each over a rule.
  const groups: { name: string; x0: number; x1: number }[] = [];
  let x = lead.reduce((a, b) => a + b, 0);
  for (const c of shown) {
    const last = groups.at(-1);
    if (last?.name === c.group) last.x1 = (x + c.width) / sum;
    else groups.push({ name: c.group, x0: x / sum, x1: (x + c.width) / sum });
    x += c.width;
  }
  const groupLabels = groups.map(({ name, x0, x1 }): LayoutAnnotation => ({
    xref: 'paper',
    yref: 'paper',
    x: (x0 + x1) / 2,
    y: ruleY,
    xanchor: 'center',
    yanchor: 'bottom',
    yshift: 4,
    showarrow: false,
    text: `<b>${name}</b>`,
    font: { color: LOOK.text, size: 11 },
  }));
  const groupRules = groups.map(({ x0, x1 }): LayoutShape => ({
    type: 'line',
    xref: 'paper',
    yref: 'paper',
    x0: x0 + 0.004,
    x1: x1 - 0.004,
    y0: ruleY,
    y1: ruleY,
    line: { color: LOOK.zero, width: 2 },
  }));
  const footnote: LayoutAnnotation = {
    xref: 'paper',
    yref: 'paper',
    x: 0,
    y: 0,
    xanchor: 'left',
    yanchor: 'top',
    yshift: -6,
    showarrow: false,
    align: 'left',
    text: narrow
      ? 'Bold: the better of a fund’s two halves.<br>Max DD: deepest fall from a high in the half.'
      : `${PERIODS.first.short}: ${PERIODS.first.label}; ${PERIODS.second.short}: ${PERIODS.second.label}; 501 sessions each. Volatility is annualized from daily returns; return / vol. is the return per year over it.<br>` +
        'Deepest drawdown: the largest fall from a high made inside the half. Bold: the better of a fund’s two halves (higher return, lower volatility, shallower drawdown, more up days).',
    font: { color: DIM, size: 9 },
  };

  const align: ('left' | 'right')[] = ['left', 'left', ...shown.map(() => 'right' as const)];
  const chart: Chart = createChart(chartEl, {
    data: [
      {
        type: 'table',
        domain: { x: [0, 1], y: [0, tableTop] },
        columnwidth,
        header: {
          values: [
            narrow ? '' : 'Fund',
            narrow ? '' : 'Half',
            ...shown.map((c) => (narrow ? c.short : c.name)),
          ],
          align,
          height: 26,
          font: { size: 10, weight: 'bold' },
        },
        cells: {
          values,
          align,
          height: ROW_HEIGHT,
          fill: { color: [fill] },
          font: { size: narrow ? 9 : 10, color: fontColor, weight: fontWeight },
        },
      },
    ],
    layout: {
      title: { text: narrow ? '' : 'The two halves, fund by fund' },
      margin: { t: narrow ? 28 : 56, b: narrow ? 36 : 44 },
      annotations: [...groupLabels, footnote],
      shapes: groupRules,
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
