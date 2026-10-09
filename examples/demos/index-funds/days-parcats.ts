import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { BASE, dailyReturns, halfOf, HALVES, INDICATOR, PERIODS, type Half } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Every one of the 1,002 sessions as a path through parallel categories (`parcats`): from its half
 * (2022–24 or 2024–26) through the S&P 500's day (SPY up more than 1%, up, down, down more than
 * 1%) and the Russell 2000's day (IWM, the same four) to the VIX's close that day (under 15,
 * 15–20, 20–30, 30 and up). The sessions are aggregated into their combinations with `counts`,
 * categories are ordered with `categoryarray` and labelled with their totals (`ticktext`), and
 * paths are colored by half (`line.color` through a two-stop `line.colorscale`), so the last
 * column shows which half the calm and the stressed days came from. Hover gives counts and shares
 * (`hovertemplate` for categories, `line.hovertemplate` for paths). An unchanged close (one SPY
 * session) counts as Down.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: every session by half, direction and VIX',
  description:
    'Parallel categories of 1,002 sessions: the half, the S&P 500’s day, the Russell 2000’s day and the VIX close, colored by half.',
  tags: ['demo', 'parcats', 'categorical', 'counts', 'colorscale', 'hover', 'financial'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

const DAYS = ['Up more than 1%', 'Up', 'Down', 'Down more than 1%'] as const;
type Day = (typeof DAYS)[number];
const VIX = ['Under 15', '15–20', '20–30', '30 and up'] as const;
type Vix = (typeof VIX)[number];

const dayOf = (r: number): Day =>
  r > 0.01 ? 'Up more than 1%' : r > 0 ? 'Up' : r >= -0.01 ? 'Down' : 'Down more than 1%';
const vixOf = (v: number): Vix =>
  v < 15 ? 'Under 15' : v < 20 ? '15–20' : v < 30 ? '20–30' : '30 and up';

interface Row {
  half: Half;
  spy: Day;
  iwm: Day;
  vix: Vix;
  n: number;
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const spy = dailyReturns('SPY').r;
  const iwm = dailyReturns('IWM').r;

  // Return i is the session at index i + 1 of the four years' window, where the VIX closes are.
  const counts = new Map<string, Row>();
  spy.forEach((r, i) => {
    const row: Row = {
      half: halfOf(BASE + 1 + i),
      spy: dayOf(r),
      iwm: dayOf(iwm[i] as number),
      vix: vixOf(INDICATOR.VIX[i + 1] as number),
      n: 1,
    };
    const key = `${row.half}|${row.spy}|${row.iwm}|${row.vix}`;
    const seen = counts.get(key);
    if (seen) seen.n += 1;
    else counts.set(key, row);
  });
  const rows = [...counts.values()];
  const sessions = spy.length;

  // Category labels with their session counts.
  const total = (pick: (r: Row) => string, value: string): number =>
    rows.filter((r) => pick(r) === value).reduce((a, r) => a + r.n, 0);
  const labelled = (values: readonly string[], pick: (r: Row) => string): string[] =>
    values.map((v) => `${v}<br>${total(pick, v)}`);
  const halfName = (h: Half): string => PERIODS[h].short;
  const calm = HALVES.map((h) =>
    rows.filter((r) => r.half === h && r.vix === 'Under 15').reduce((a, r) => a + r.n, 0),
  );

  const chart: Chart = createChart(chartEl, {
    data: [
      {
        type: 'parcats',
        counts: rows.map((r) => r.n),
        dimensions: [
          {
            label: 'Half',
            values: rows.map((r) => halfName(r.half)),
            categoryarray: HALVES.map(halfName),
            ticktext: labelled(HALVES.map(halfName), (r) => halfName(r.half)),
          },
          {
            label: narrow ? 'SPY day' : 'S&P 500 day (SPY)',
            values: rows.map((r) => r.spy),
            categoryarray: DAYS,
            ticktext: labelled(DAYS, (r) => r.spy),
          },
          {
            label: narrow ? 'IWM day' : 'Russell 2000 day (IWM)',
            values: rows.map((r) => r.iwm),
            categoryarray: DAYS,
            ticktext: labelled(DAYS, (r) => r.iwm),
          },
          {
            label: 'VIX close',
            values: rows.map((r) => r.vix),
            categoryarray: VIX,
            ticktext: labelled(VIX, (r) => r.vix),
          },
        ],
        line: {
          color: rows.map((r) => (r.half === 'first' ? 0 : 1)),
          colorscale: [
            [0, PERIODS.first.color],
            [1, PERIODS.second.color],
          ],
          shape: 'hspline',
          hovertemplate: '<b>%{count:,} sessions</b> (%{probability:.1%} of all)<extra></extra>',
        },
        hoveron: 'category',
        hovertemplate:
          '%{category}: <b>%{count:,} sessions</b> (%{probability:.1%})<extra></extra>',
        labelfont: { size: 12, color: LOOK.title },
        tickfont: { size: narrow ? 9 : 11, color: LOOK.title },
      },
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : `The VIX closed under 15 on ${calm[0]} sessions of 2022–24 and ${calm[1]} of 2024–26 ` +
            `(${sessions.toLocaleString('en-US')} sessions)`,
      },
      margin: { t: 72, l: 48, r: narrow ? 56 : 88, b: 24 },
      annotations: [
        {
          xref: 'paper',
          yref: 'paper',
          x: 1,
          y: 1,
          yshift: 44,
          xanchor: 'right',
          yanchor: 'bottom',
          showarrow: false,
          text: 'Paths colored by half: teal 2022–24, amber 2024–26',
          font: { size: 10, color: LOOK.text },
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
