import { createChart, type Chart, type LayoutAnnotation } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  COLOR,
  DOWN,
  fmtDate,
  FUNDS,
  type Fund,
  headline,
  LAST_DATE,
  pct,
  SERIES,
  UNDERLYING,
  UP,
  usd,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Where TQQQ and SOXL stand on the last day of the data: a KPI panel of `indicator` traces, one
 * row per fund, placed by `domain`. Per fund: the last close with the day's change as a relative
 * `delta`; the year-to-date return with its lead over the unleveraged ETF on the same index as an
 * absolute delta (in percentage points); a `gauge.shape: 'bullet'` showing where the close sits in
 * its 52-week range, with the low and high as the axis ticks; and the current drawdown from the
 * all-time high, next to the deepest one since 2010. Row labels are paper-referenced annotations.
 * Prices are total-return (dividend-adjusted) closes. Narrow containers (phones) get three
 * smaller cards per fund, without the bullet, under a one-line fund heading.
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: KPI dashboard',
  description:
    'Last close and day change, YTD return against QQQ / SOXX, the 52-week range as a bullet gauge and the drawdown from the high, for both funds.',
  tags: ['demo', 'indicator', 'kpi', 'dashboard', 'bullet', 'gauge', 'delta', 'financial'],
  size: { width: 960, height: 320 },
  testTolerance: 0.004,
};

/** Paper x ranges of the four KPI columns (the row label takes the left margin). */
const COLUMNS: [number, number][] = [
  [0.12, 0.3],
  [0.33, 0.52],
  [0.66, 0.82],
  [0.85, 1],
];
/** Narrow containers: last close, YTD and from-high columns (no bullet). */
const NARROW_COLUMNS: [number, number][] = [
  [0, 0.31],
  [0.345, 0.655],
  [0.69, 1],
];
/** Paper y ranges of the two rows. */
const ROWS: Record<Fund, [number, number]> = { TQQQ: [0.58, 0.84], SOXL: [0.04, 0.3] };
const NARROW_ROWS: Record<Fund, [number, number]> = { TQQQ: [0.56, 0.86], SOXL: [0.04, 0.34] };
/** Font sizes (wide, narrow): the number, its delta, the titles. */
const NUMBER = [34, 22] as const;
const DELTA = [14, 11] as const;
const TITLE = [12, 10] as const;

/** Short index names for the row labels. */
const SHORT_INDEX: Record<Fund, string> = { TQQQ: 'Nasdaq-100', SOXL: 'semiconductors' };

const small = (s: string): string => `<span style="font-size:0.8em">${s}</span>`;

/** Date of the deepest drawdown since the common start. */
function troughDate(fund: Fund): string {
  const { dates, adj } = SERIES[fund];
  let peak = -Infinity;
  let worst = 0;
  let at = dates[0] as string;
  adj.forEach((v, i) => {
    peak = Math.max(peak, v);
    if (v / peak - 1 < worst) {
      worst = v / peak - 1;
      at = dates[i] as string;
    }
  });
  return at;
}

function row(fund: Fund, narrow: boolean): Record<string, unknown>[] {
  const h = headline(fund);
  const ref = headline(UNDERLYING[fund]);
  const y = (narrow ? NARROW_ROWS : ROWS)[fund];
  const k = narrow ? 1 : 0;
  const [close, ytd, fromHigh] = narrow
    ? (NARROW_COLUMNS as [[number, number], [number, number], [number, number]])
    : [COLUMNS[0], COLUMNS[1], COLUMNS[3]];
  const [prev] = SERIES[fund].adj.slice(-2) as [number, number];
  const delta = {
    increasing: { color: UP },
    decreasing: { color: DOWN },
    font: { size: DELTA[k] },
  };
  const title = (text: string): Record<string, unknown> => ({
    text: narrow ? (text.split('<br>')[0] as string) : text,
    font: { size: TITLE[k] },
  });
  const number = (extra: Record<string, unknown>): Record<string, unknown> => ({
    ...extra,
    font: { size: NUMBER[k], ...(extra['font'] as object | undefined) },
  });
  const trough = troughDate(fund);
  const cards: Record<string, unknown>[] = [
    {
      type: 'indicator',
      mode: 'number+delta',
      name: `${fund} last close`,
      value: h.last,
      number: number({ prefix: '$', valueformat: ',.2f' }),
      delta: { ...delta, reference: prev, relative: true, valueformat: '.2%' },
      title: title(`Last close<br>${small(fmtDate(LAST_DATE))}`),
      domain: { x: close, y },
    },
    {
      type: 'indicator',
      mode: 'number+delta',
      name: `${fund} YTD`,
      // In percent, so the delta reads in percentage points.
      value: h.ytd * 100,
      number: number({ valueformat: '+.1f', suffix: '%' }),
      delta: { ...delta, reference: ref.ytd * 100, valueformat: '.1f', suffix: ' pts' },
      title: title(`YTD return<br>${small(`vs ${ref.ticker} ${pct(ref.ytd)}`)}`),
      domain: { x: ytd, y },
    },
  ];
  const bullet = {
    type: 'indicator',
    mode: 'gauge',
    name: `${fund} 52-week range`,
    value: h.last,
    title: title(
      `52-week range<br>${small(`${pct((h.last - h.low52) / (h.high52 - h.low52), 0, false)} of the way up`)}`,
    ),
    domain: { x: COLUMNS[2], y: [y[0] + 0.04, y[1] - 0.04] },
    gauge: {
      shape: 'bullet',
      axis: {
        range: [h.low52, h.high52],
        tickvals: [h.low52, h.high52],
        ticktext: [usd(h.low52), usd(h.high52)],
        tickfont: { size: 10 },
      },
      bar: { color: COLOR[fund], thickness: 0.5 },
      bgcolor: 'rgba(255, 255, 255, 0.04)',
    },
  };
  const high = {
    type: 'indicator',
    mode: 'number',
    name: `${fund} from high`,
    value: h.fromHigh,
    number: number({ valueformat: '.1%', font: { color: DOWN } }),
    title: title(`From all-time high<br>${small(`max ${pct(h.maxDrawdown)}, ${fmtDate(trough)}`)}`),
    // Raised to line up with the number-and-delta cards, whose number sits above the delta.
    domain: { x: fromHigh, y: [y[0] + 0.04, y[1] + 0.04] },
  };
  return narrow ? [...cards, high] : [...cards, bullet, high];
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  // Phones: one heading line above each row; wide: name and index in the left margin.
  const narrowLabels = FUNDS.map((fund): LayoutAnnotation => ({
    xref: 'paper',
    yref: 'paper',
    x: 0,
    y: (NARROW_ROWS[fund][1] as number) + 0.03,
    xanchor: 'left',
    yanchor: 'bottom',
    text: `<b>${fund}</b>  3× ${SHORT_INDEX[fund]}`,
    showarrow: false,
    font: { color: COLOR[fund], size: 12 },
  }));
  const wideLabels = FUNDS.flatMap((fund): LayoutAnnotation[] => {
    const [y0, y1] = ROWS[fund];
    const mid = (y0 + y1) / 2;
    return [
      {
        xref: 'paper',
        yref: 'paper',
        x: 0,
        y: mid,
        xanchor: 'left',
        yanchor: 'bottom',
        text: `<b>${fund}</b>`,
        showarrow: false,
        font: { color: COLOR[fund], size: 18 },
      },
      {
        xref: 'paper',
        yref: 'paper',
        x: 0,
        y: mid,
        xanchor: 'left',
        yanchor: 'top',
        text: `3× ${SHORT_INDEX[fund]}`,
        showarrow: false,
        font: { size: 10 },
      },
    ];
  });

  const chart: Chart = createChart(chartEl, {
    data: FUNDS.flatMap((fund) => row(fund, narrow)),
    layout: {
      title: { text: narrow ? '' : `TQQQ and SOXL on ${fmtDate(LAST_DATE)}` },
      margin: { l: 24, r: 24, t: narrow ? 16 : 48, b: 16 },
      annotations: narrow ? narrowLabels : wideLabels,
      shapes: [
        {
          type: 'line',
          xref: 'paper',
          yref: 'paper',
          x0: 0,
          x1: 1,
          y0: narrow ? 0.44 : 0.46,
          y1: narrow ? 0.44 : 0.46,
          line: { color: LOOK.axis, width: 1 },
        },
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
