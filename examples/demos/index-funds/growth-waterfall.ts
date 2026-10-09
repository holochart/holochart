import {
  createChart,
  type Chart,
  type FigureInput,
  type LayoutAnnotation,
  type LayoutShape,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  adj,
  BASE,
  BASE_DATE,
  COLOR,
  DOWN,
  fmtDate,
  type Fund,
  type Half,
  LABEL,
  LAST_DATE,
  pct,
  PERIODS,
  QUARTER_SPANS,
  SPLIT_DATE,
  UP,
  usd,
} from './analysis.mts';
import { chartConfig, frame, fundPicker, isNarrow, LOOK, rgba, settled } from './ui.mts';

/**
 * $10,000 in a fund, quarter by quarter, as a `waterfall`: an `absolute` bar for the stake on Sep
 * 30, 2022, eight `relative` bars for the first half's quarterly gains and losses in dollars, a
 * `total` bar where the halves meet (Sep 30, 2024), eight more quarters and a closing `total`.
 * Rising quarters are green, falling ones red, and the three sum bars take the fund's color; every
 * bar is labelled (`text` outside the bars). The halves are tinted bands behind their eight
 * quarters, placed by category position. The toolbar toggle swaps the fund with `chart.react`.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: $10,000 quarter by quarter',
  description:
    'Waterfall of $10,000 invested on September 30, 2022 in SPY, QQQ, DIA or IWM: sixteen quarterly gains and losses with a subtotal at the split and a total at the end.',
  tags: ['demo', 'waterfall', 'category', 'text', 'shapes', 'annotations', 'react', 'financial'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

const START = 10_000;
/** Quarters in the first half, and bar positions: start, 8 quarters, subtotal, 8 quarters, total. */
const FIRST = QUARTER_SPANS.filter((q) => q.half === 'first').length;
const SECOND = QUARTER_SPANS.length - FIRST;

/** `'Sep 30, 2024'` → `'Sep 30<br>2024'`, in bold, for a sum bar's tick. */
const sumTick = (date: string): string => `<b>${fmtDate(date).replace(', ', '<br>')}</b>`;
/** A dollar change with its sign: `'+$761'`, `'−$432'`. */
const signedUsd = (v: number): string => `${v < 0 ? '−' : '+'}${usd(Math.abs(v))}`;

function bands(): LayoutShape[] {
  const band = (x0: number, x1: number, half: Half): LayoutShape => ({
    type: 'rect',
    xref: 'x',
    yref: 'y domain',
    x0,
    x1,
    y0: 0,
    y1: 1,
    fillcolor: rgba(PERIODS[half].color, 0.05),
    line: { width: 0 },
    layer: 'below',
  });
  return [band(0.5, FIRST + 0.5, 'first'), band(FIRST + 1.5, FIRST + SECOND + 1.5, 'second')];
}

function bandLabels(texts: Record<Half, string>): LayoutAnnotation[] {
  const label = (x: number, half: Half): LayoutAnnotation => ({
    xref: 'x',
    yref: 'y domain',
    x,
    y: 1,
    text: texts[half],
    showarrow: false,
    xanchor: 'left',
    yanchor: 'top',
    xshift: 6,
    yshift: -4,
    font: { color: PERIODS[half].color, size: 10 },
  });
  return [label(0.5, 'first'), label(FIRST + 1.5, 'second')];
}

function figure(fund: Fund, narrow: boolean): FigureInput {
  const a = adj(fund);
  const value = (i: number): number => ((a[i] as number) / (a[BASE] as number)) * START;
  const steps = QUARTER_SPANS.map((q) => ({
    label: q.label,
    change: value(q.to) - value(q.from),
    r: (a[q.to] as number) / (a[q.from] as number) - 1,
    end: value(q.to),
  }));
  const first = steps.slice(0, FIRST);
  const second = steps.slice(FIRST);
  const middle = first.at(-1)?.end ?? START;
  const end = second.at(-1)?.end ?? START;

  const quarterTick = (label: string): string =>
    narrow ? (label.startsWith('Q1') ? `’${label.slice(5)}` : '') : label.replace(' ', '<br>');
  const keys = [
    'start',
    ...first.map((s) => s.label),
    'split',
    ...second.map((s) => s.label),
    'end',
  ];
  const hover = (s: (typeof steps)[number]): string =>
    `<b>${s.label}</b><br>${signedUsd(s.change)} (${pct(s.r, 1)})<br>ends at ${usd(s.end)}`;
  const sumHover = (date: string, v: number): string => `<b>${fmtDate(date)}</b><br>${usd(v)}`;

  return {
    data: [
      {
        type: 'waterfall',
        name: fund,
        x: keys,
        y: [START, ...first.map((s) => s.change), null, ...second.map((s) => s.change), null],
        measure: [
          'absolute',
          ...first.map(() => 'relative'),
          'total',
          ...second.map(() => 'relative'),
          'total',
        ],
        // Phones have no room for a label on every quarter: the three sums keep theirs.
        text: [
          usd(START),
          ...first.map((s) => (narrow ? '' : signedUsd(s.change))),
          usd(middle),
          ...second.map((s) => (narrow ? '' : signedUsd(s.change))),
          usd(end),
        ],
        textinfo: 'text',
        textposition: 'outside',
        textfont: { size: narrow ? 8 : 9 },
        hovertext: [
          sumHover(BASE_DATE, START),
          ...first.map(hover),
          sumHover(SPLIT_DATE, middle),
          ...second.map(hover),
          sumHover(LAST_DATE, end),
        ],
        hovertemplate: `%{hovertext}<extra>${fund}</extra>`,
        increasing: { marker: { color: UP } },
        decreasing: { marker: { color: DOWN } },
        totals: { marker: { color: COLOR[fund] } },
        connector: { line: { color: LOOK.zero, width: 1 } },
      },
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : `${fund} · ${LABEL[fund]}: ${usd(START)} became ${usd(middle)} by ${fmtDate(SPLIT_DATE)} and ${usd(end)} by ${fmtDate(LAST_DATE)}`,
      },
      showlegend: false,
      waterfallgap: 0.22,
      margin: { b: 52, r: narrow ? 8 : 24 },
      xaxis: {
        type: 'category',
        showgrid: false,
        tickvals: keys,
        ticktext: [
          sumTick(BASE_DATE),
          ...first.map((s) => quarterTick(s.label)),
          sumTick(SPLIT_DATE),
          ...second.map((s) => quarterTick(s.label)),
          sumTick(LAST_DATE),
        ],
        tickfont: { size: narrow ? 8 : 10 },
      },
      yaxis: {
        title: { text: 'Value (USD)' },
        tickprefix: '$',
        tickformat: ',.0f',
        range: [0, Math.max(...steps.map((s) => s.end)) * 1.12],
      },
      shapes: bands(),
      annotations: bandLabels({
        first: `${PERIODS.first.short}: ${signedUsd(middle - START)} (${pct(middle / START - 1)})`,
        second: `${PERIODS.second.short}: ${signedUsd(end - middle)} (${pct(end / middle - 1)})`,
      }),
    },
    config: chartConfig(narrow),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const chart: Chart = createChart(chartEl, figure('SPY', narrow));
  fundPicker(toolbar, (fund) => void chart.react(figure(fund, narrow)));

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
