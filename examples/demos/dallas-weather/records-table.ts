import { createChart, type Chart, type Figure, type TableTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  COLD,
  DATE,
  FIRST_DATE,
  fmtDate,
  HOT,
  LAST_DATE,
  N,
  PRCP,
  RAIN,
  TMAX,
  TMIN,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, segmented, settled } from './ui.mts';
import { alpha } from './years-events.mts';

/**
 * The record book as `table` traces: the ten hottest days (highest highs), the ten coldest nights
 * (lowest lows) and the ten wettest days of the whole record, each with its date. Three tables
 * sit side by side (`domain`), each with its own header and cell tints (`header.fill`,
 * `cells.fill`, `cells.font.color` per column); equal values are ordered by date, earliest first.
 * Narrow containers (phones) show one table at a time, picked with a toolbar toggle
 * (`chart.react(…)`).
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: the record book',
  description:
    'Three tables side by side: the ten hottest days, the ten coldest nights and the ten wettest days at Dallas Love Field since 1939, with dates.',
  tags: ['demo', 'table', 'style', 'records', 'react'],
  size: { width: 960, height: 470 },
  testTolerance: 0.004,
};

type Block = 'hot' | 'cold' | 'wet';

const BLOCKS: Record<
  Block,
  {
    short: string;
    title: string;
    column: string;
    color: string;
    values: readonly (number | null)[];
    /** 1 for the highest values, −1 for the lowest. */
    direction: 1 | -1;
    format: (v: number) => string;
  }
> = {
  hot: {
    short: 'Hottest',
    title: 'Hottest days',
    column: 'High',
    color: HOT,
    values: TMAX,
    direction: 1,
    format: (v) => `${v} °F`,
  },
  cold: {
    short: 'Coldest',
    title: 'Coldest nights',
    column: 'Low',
    color: COLD,
    values: TMIN,
    direction: -1,
    format: (v) => `${v} °F`,
  },
  wet: {
    short: 'Wettest',
    title: 'Wettest days',
    column: 'Rain',
    color: RAIN,
    values: PRCP,
    direction: 1,
    format: (v) => `${v.toFixed(2)} in`,
  },
};
const ORDER: Block[] = ['hot', 'cold', 'wet'];
const TOP = 10;

/** Day indexes of the `TOP` most extreme values; equal values in date order. */
function top(values: readonly (number | null)[], direction: 1 | -1): number[] {
  const idx: number[] = [];
  for (let i = 0; i < N; i++) if (values[i] !== null && values[i] !== undefined) idx.push(i);
  return idx
    .sort((a, b) => direction * ((values[b] as number) - (values[a] as number)) || a - b)
    .slice(0, TOP);
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);

  const table = (block: Block, x: [number, number]): TableTrace => {
    const b = BLOCKS[block];
    const rows = top(b.values, b.direction);
    // Strongest tint on the first row, fading down the list.
    const fill = rows.map((_, k) => alpha(b.color, 0.34 - k * 0.022));
    return {
      type: 'table',
      name: b.title,
      domain: { x, y: [0, 1] },
      columnwidth: [0.5, 2, 1.2],
      header: {
        values: ['<b>#</b>', `<b>${b.title}</b>`, `<b>${b.column}</b>`],
        align: ['right', 'left', 'right'],
        height: 30,
        fill: { color: alpha(b.color, 0.6) },
        line: { color: LOOK.bg, width: 1 },
        font: { size: 12, color: '#ffffff' },
      },
      cells: {
        values: [
          rows.map((_, k) => String(k + 1)),
          rows.map((i) => fmtDate(DATE[i] as string)),
          rows.map((i) => `<b>${b.format(b.values[i] as number)}</b>`),
        ],
        align: ['right', 'left', 'right'],
        height: 29,
        fill: { color: [fill, fill, fill] },
        line: { color: LOOK.bg, width: 1 },
        font: { size: 12, color: [LOOK.text, LOOK.title, LOOK.title] },
      },
    };
  };

  const figure = (only: Block): Figure => ({
    data: narrow
      ? [table(only, [0, 1])]
      : [table('hot', [0, 0.32]), table('cold', [0.34, 0.66]), table('wet', [0.68, 1])],
    layout: {
      title: {
        text: narrow
          ? ''
          : `The record book: ${FIRST_DATE.slice(0, 4)} to ${LAST_DATE.slice(0, 4)} at Dallas Love Field`,
      },
      margin: { t: narrow ? 12 : 56, b: 36, l: 16, r: 16 },
      annotations: [
        {
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
            ? 'Equal values are listed in date order.'
            : 'Highest daily highs, lowest daily lows and largest one-day rain totals. Equal values are listed in date order.',
          font: { size: 10, color: LOOK.tick },
        },
      ],
    },
    config: chartConfig(narrow),
  });

  const chart: Chart = createChart(chartEl, figure('hot'));

  if (narrow) {
    segmented<Block>(
      toolbar,
      'Records',
      ORDER.map((value) => ({ value, text: BLOCKS[value].short })),
      (value) => void chart.react(figure(value)),
      'hot',
    );
  }

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
