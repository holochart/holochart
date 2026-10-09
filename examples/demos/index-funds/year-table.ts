import { createChart, type Chart, type LayoutAnnotation, type LayoutShape } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  BASE_DATE,
  colorOf,
  DOWN,
  fmtDate,
  FUNDS,
  type Half,
  LABEL,
  LAST_DATE,
  pct,
  PERIODS,
  SPLIT_DATE,
  STYLES,
  type Ticker,
  totalReturn,
  UP,
  YEAR_SPANS,
  yearlyReturns,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, rgba, settled } from './ui.mts';

/**
 * Calendar-year returns as a `table` trace: a row per fund (the five main index funds, then the
 * four size and style funds under a section row), a column per calendar year and one for the four
 * years. Every style attribute is set per column and row (nested arrays): a return cell gets a
 * green or red fill whose strength follows the size of the move, each fund's best and worst year is
 * bold, and the ticker takes the fund's color. Paper-referenced `shapes` and `annotations` draw a
 * rule over the year columns in each half's color (the split falls three quarters of the way
 * through 2024, and so does the rule) and carry the footnote. Narrow containers drop the "tracks"
 * column.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: calendar-year returns',
  description:
    'A table of calendar-year total returns of five index funds and four style funds for 2022 (Q4) to 2026 (to September) and the four years, cells tinted by sign and size.',
  tags: ['demo', 'table', 'annotations', 'shapes', 'style', 'financial'],
  size: { width: 960, height: 500 },
  testTolerance: 0.004,
};

/** Fill of a return cell: the sign's hue, stronger for larger moves (full strength at ±50%). */
const returnFill = (r: number): string =>
  rgba(r >= 0 ? UP : DOWN, 0.1 + 0.55 * Math.min(1, Math.abs(r) / 0.5));

const DIM = '#80838f';
/**
 * Row height: what a cell whose text has a space or an `&` needs (such cells may wrap, so their row
 * grows to the text block plus the cell padding, as in Plotly), declared so every row matches.
 */
const ROW_HEIGHT = 30;
const SECTION_FILL = '#101017';
const TOTAL_FILL = '#15151d';

type Row = { section: string } | { t: Ticker };

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const rows: Row[] = [
    { section: 'Index funds' },
    ...FUNDS.map((t) => ({ t })),
    { section: 'Size and style funds' },
    ...STYLES.map((t) => ({ t })),
  ];
  const isFund = (row: Row): row is { t: Ticker } => 't' in row;
  /** A column from one function of the fund; section rows get `section` (default empty). */
  const column = <T>(of: (t: Ticker) => T, section: (name: string) => T): T[] =>
    rows.map((row) => (isFund(row) ? of(row.t) : section(row.section)));

  const yearly = new Map<Ticker, number[]>([...FUNDS, ...STYLES].map((t) => [t, yearlyReturns(t)]));
  const of = (t: Ticker): number[] => yearly.get(t) ?? [];
  const baseFill = column(
    () => LOOK.bg as string,
    () => SECTION_FILL,
  );

  // Leading columns: the ticker (in the fund's color; the section name on section rows) and what
  // it tracks.
  const values: string[][] = [
    column(
      (t) => t as string,
      (name) => (narrow ? (name.split(' ')[0] ?? '') : name),
    ),
  ];
  const fills: string[][] = [baseFill];
  const fontColor: string[][] = [
    column(
      (t) => colorOf(t),
      () => DIM,
    ),
  ];
  const fontWeight: ('normal' | 'bold')[][] = [
    column(
      () => 'bold',
      () => 'normal',
    ),
  ];
  const header = [narrow ? '' : 'Fund'];
  const columnwidth = [narrow ? 0.8 : 1.5];
  if (!narrow) {
    values.push(
      column(
        (t) => LABEL[t],
        () => '',
      ),
    );
    fills.push(baseFill);
    fontColor.push(
      column(
        () => LOOK.text as string,
        () => DIM,
      ),
    );
    fontWeight.push(
      column(
        () => 'normal',
        () => 'normal',
      ),
    );
    header.push('Tracks');
    columnwidth.push(1.7);
  }
  const lead = columnwidth.reduce((a, b) => a + b, 0);

  YEAR_SPANS.forEach((span, i) => {
    values.push(
      column(
        (t) => pct(of(t)[i] ?? 0, 1),
        () => '',
      ),
    );
    fills.push(
      column(
        (t) => returnFill(of(t)[i] ?? 0),
        () => SECTION_FILL,
      ),
    );
    fontColor.push(
      column(
        () => LOOK.title as string,
        () => DIM,
      ),
    );
    fontWeight.push(
      column(
        (t) => {
          const r = of(t);
          return r[i] === Math.max(...r) || r[i] === Math.min(...r) ? 'bold' : 'normal';
        },
        () => 'normal',
      ),
    );
    header.push(narrow ? span.key : span.label);
    columnwidth.push(1);
  });
  values.push(
    column(
      (t) => pct(totalReturn(t), 0),
      () => '',
    ),
  );
  fills.push(
    column(
      () => TOTAL_FILL,
      () => SECTION_FILL,
    ),
  );
  fontColor.push(
    column(
      () => LOOK.title as string,
      () => DIM,
    ),
  );
  fontWeight.push(
    column(
      () => 'bold',
      () => 'normal',
    ),
  );
  header.push(narrow ? '4 yrs' : 'Four years');
  columnwidth.push(1.05);

  // The halves over the year columns: the split is the close of Sep 30, 2024, three quarters of
  // the way through the 2024 column.
  const sum = columnwidth.reduce((a, b) => a + b, 0);
  const tableTop = 0.94;
  // The rules sit just above the table's own top border.
  const ruleY = tableTop + 0.014;
  const yearsFrom = lead / sum;
  const yearsTo = (lead + YEAR_SPANS.length) / sum;
  const year2024 = YEAR_SPANS.findIndex((s) => s.key === '2024');
  const split = (lead + year2024 + 0.75) / sum;
  const rule = (x0: number, x1: number, half: Half): LayoutShape => ({
    type: 'line',
    xref: 'paper',
    yref: 'paper',
    x0,
    x1,
    y0: ruleY,
    y1: ruleY,
    line: { color: PERIODS[half].color, width: 2 },
  });
  const ruleLabel = (x: number, half: Half): LayoutAnnotation => ({
    xref: 'paper',
    yref: 'paper',
    x,
    y: ruleY,
    xanchor: 'center',
    yanchor: 'bottom',
    yshift: 4,
    showarrow: false,
    text: narrow
      ? `<b>${PERIODS[half].short}</b>`
      : `<b>${PERIODS[half].short}</b>  ${PERIODS[half].label}`,
    font: { color: PERIODS[half].color, size: 11 },
  });
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
      ? `2022 is Q4 only, 2026 runs to September.<br>Bold: each fund's best and worst year.`
      : `2022 is the fourth quarter only (from the close of ${fmtDate(BASE_DATE)}); 2026 runs to ${fmtDate(LAST_DATE)}. ` +
        `The halves meet at the close of ${fmtDate(SPLIT_DATE)}, inside 2024.<br>` +
        `Bold: each fund's best and worst of the five columns. Total return, dividends reinvested.`,
    font: { color: DIM, size: 9 },
  };

  const chart: Chart = createChart(chartEl, {
    data: [
      {
        type: 'table',
        domain: { x: [0, 1], y: [0, tableTop] },
        columnwidth,
        header: {
          values: header,
          align: narrow ? ['left', 'right'] : ['left', 'left', 'right'],
          height: 26,
          font: { size: 10, weight: 'bold' },
        },
        cells: {
          values,
          align: narrow ? ['left', 'right'] : ['left', 'left', 'right'],
          height: ROW_HEIGHT,
          fill: { color: fills },
          font: { size: narrow ? 9 : 10, color: fontColor, weight: fontWeight },
        },
      },
    ],
    layout: {
      title: { text: narrow ? '' : 'Calendar-year total returns, 2022–2026' },
      margin: { t: narrow ? 28 : 56, b: narrow ? 36 : 44 },
      annotations: [
        ruleLabel((yearsFrom + split) / 2, 'first'),
        ruleLabel((split + yearsTo) / 2, 'second'),
        footnote,
      ],
      shapes: [
        rule(yearsFrom + 0.004, split - 0.003, 'first'),
        rule(split + 0.003, yearsTo - 0.004, 'second'),
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
