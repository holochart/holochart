import { createChart, type Chart, type LayoutAnnotation, type LayoutShape } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  COLOR,
  COMMON_RETURNS,
  COMMON_START,
  DOWN,
  fmtDate,
  FUNDS,
  headline,
  LAST_DATE,
  pct,
  stdev,
  UP,
  yearStats,
  type Fund,
  type YearStats,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, settled } from './ui.mts';

/**
 * Year by year, side by side: a `table` trace with one row per calendar year and, for each fund,
 * the total return, the annualized volatility of daily returns, the deepest drawdown within the
 * year, the best and worst day and the share of up days. Every style attribute is set per column
 * and row (nested arrays): return cells get a green or red fill whose strength follows the size of
 * the move, each fund's best and worst year is bold, and the partial years (2010 from SOXL's first
 * day, 2026 to date) are italic and starred. A closing row gives the whole period (the return as a
 * compound annual rate). Paper-referenced `annotations` and `shapes` label the two column groups in
 * the funds' colors and carry the footnote. Narrow containers (phones) keep the return and max
 * drawdown columns only.
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: year by year',
  description:
    'A table of yearly return, volatility, max drawdown, best and worst day and share of up days for TQQQ and SOXL since 2010, return cells tinted by sign.',
  tags: ['demo', 'table', 'annotations', 'shapes', 'style', 'financial'],
  size: { width: 960, height: 600 },
  testTolerance: 0.004,
};

/** The statistic columns of each fund group. */
const STATS = ['Return', 'Volatility', 'Max drawdown', 'Best day', 'Worst day', 'Up days'] as const;
/** The columns kept on narrow containers (indexes into `STATS`). */
const NARROW_STATS = [0, 2];
/** Relative column widths: the year column, then one group per fund. */
const YEAR_WIDTH = 0.9;

/** `rgb` hex → `rgba(…)` with alpha `a`. */
function tint(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
}

/** Fill of a return cell: the sign's hue, stronger for larger moves (full strength at ±150%). */
function returnFill(r: number): string {
  return tint(r >= 0 ? UP : DOWN, 0.1 + 0.55 * Math.min(1, Math.abs(r) / 1.5));
}

/** Whole-period figures of a fund, in the shape of a year row. */
function wholePeriod(fund: Fund): Omit<YearStats, 'year' | 'partial' | 'days'> {
  const { r } = COMMON_RETURNS[fund];
  const h = headline(fund);
  return {
    ticker: fund,
    ret: h.cagr,
    vol: stdev(r) * Math.sqrt(252),
    maxDrawdown: h.maxDrawdown,
    best: Math.max(...r),
    worst: Math.min(...r),
    upShare: r.filter((v) => v > 0).length / r.length,
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const shown = narrow ? NARROW_STATS : STATS.map((_, i) => i);
  const statName = (i: number): string => (narrow && i === 2 ? 'Max DD' : (STATS[i] as string));

  const stats = Object.fromEntries(FUNDS.map((f) => [f, yearStats(f)])) as Record<
    Fund,
    YearStats[]
  >;
  const years = stats.TQQQ;
  const total = years.length; // index of the whole-period row
  const partial = years.map((y) => y.partial);
  const lastYear = LAST_DATE.slice(0, 4);

  const yearColumn = [
    ...years.map((y) => (y.partial ? `${y.year}*` : String(y.year))),
    narrow ? '2010–26' : `${COMMON_START.slice(0, 4)}–${lastYear.slice(2)}`,
  ];

  // Per-row text style shared by every column: partial years italic and dimmer, the total bold.
  const italic: ('normal' | 'italic')[] = [
    ...partial.map((p) => (p ? 'italic' : 'normal')),
    'normal',
  ];
  const dim = '#80838f';
  const text = '#a4a7b5';
  const bright = '#eceef4';
  const baseColor = [...partial.map((p) => (p ? dim : text)), bright];
  const baseWeight: ('normal' | 'bold')[] = [...years.map(() => 'normal' as const), 'bold'];
  const background = '#0a0a0f';
  const totalFill = '#15151d';
  const baseFill = [...years.map(() => background), totalFill];

  const values: string[][] = [yearColumn];
  const fills: string[][] = [baseFill];
  const fontColor: string[][] = [baseColor];
  const fontWeight: ('normal' | 'bold')[][] = [baseWeight];

  for (const fund of FUNDS) {
    const ys = stats[fund];
    const all = wholePeriod(fund);
    // Best and worst full year, in bold.
    const full = ys.filter((y) => !y.partial);
    const best = Math.max(...full.map((y) => y.ret));
    const worst = Math.min(...full.map((y) => y.ret));
    const columns: [(s: Omit<YearStats, 'year' | 'partial' | 'days'>) => string, boolean][] = [
      [(s) => pct(s.ret), true],
      [(s) => pct(s.vol, 1, false), false],
      [(s) => pct(s.maxDrawdown), false],
      [(s) => pct(s.best), false],
      [(s) => pct(s.worst), false],
      [(s) => pct(s.upShare, 1, false), false],
    ];
    columns.forEach(([format, isReturn], i) => {
      if (!shown.includes(i)) return;
      const col = [...ys.map(format), format(all)];
      if (isReturn) col[total] = `${col[total] as string}/yr`;
      values.push(col);
      fills.push(isReturn ? [...ys.map((y) => returnFill(y.ret)), totalFill] : baseFill);
      fontColor.push(isReturn ? [...partial.map((p) => (p ? text : bright)), bright] : baseColor);
      fontWeight.push(
        isReturn
          ? [
              ...ys.map((y) =>
                !y.partial && (y.ret === best || y.ret === worst) ? 'bold' : 'normal',
              ),
              'bold',
            ]
          : baseWeight,
      );
    });
  }

  const header = ['Year', ...FUNDS.flatMap(() => shown.map(statName))];
  const columnwidth = [YEAR_WIDTH, ...FUNDS.flatMap(() => shown.map(() => 1))];
  const sum = columnwidth.reduce((a, b) => a + b, 0);
  const tableTop = 0.94;

  // Group labels over each fund's six columns, with a rule under each label.
  const groups = FUNDS.map((fund, g) => {
    const x0 = (YEAR_WIDTH + g * shown.length) / sum;
    const x1 = (YEAR_WIDTH + (g + 1) * shown.length) / sum;
    return { fund, x0, x1 };
  });
  const groupLabels = groups.map(({ fund, x0, x1 }): LayoutAnnotation => ({
    xref: 'paper',
    yref: 'paper',
    x: (x0 + x1) / 2,
    y: tableTop,
    yanchor: 'bottom',
    yshift: 4,
    showarrow: false,
    text: narrow
      ? `<b>${fund}</b>`
      : `<b>${fund}</b>  3× ${fund === 'TQQQ' ? 'Nasdaq-100' : 'semiconductors'}`,
    font: { color: COLOR[fund], size: 11 },
  }));
  const groupRules = groups.map(({ fund, x0, x1 }): LayoutShape => ({
    type: 'line',
    xref: 'paper',
    yref: 'paper',
    x0: x0 + 0.004,
    x1: x1 - 0.004,
    y0: tableTop,
    y1: tableTop,
    line: { color: COLOR[fund], width: 2 },
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
      ? `* Partial years. Last row: the whole period,<br>return as a compound annual rate.`
      : `* Partial years: ${COMMON_START.slice(0, 4)} from ${fmtDate(COMMON_START)} (SOXL's first day), ` +
        `${lastYear} to ${fmtDate(LAST_DATE)}.<br>` +
        `Volatility is annualized from daily returns; max drawdown is the deepest fall within the year. Last row: the whole period, return as a compound annual rate. Total return, dividends reinvested.`,
    font: { color: dim, size: 9 },
  };

  const chart: Chart = createChart(chartEl, {
    data: [
      {
        type: 'table',
        domain: { x: [0, 1], y: [0, tableTop] },
        columnwidth,
        header: {
          values: header,
          align: ['left', 'right'],
          height: 26,
          font: { size: 10, weight: 'bold' },
        },
        cells: {
          values,
          align: ['left', 'right'],
          height: 22,
          fill: { color: fills },
          font: { size: 10, color: fontColor, weight: fontWeight, style: [italic] },
        },
      },
    ],
    layout: {
      title: {
        text: narrow ? '' : `TQQQ and SOXL year by year, ${COMMON_START.slice(0, 4)}–${lastYear}`,
      },
      margin: { t: narrow ? 28 : 52, b: narrow ? 36 : 44 },
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
