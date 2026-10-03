import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COMMON_RETURNS, COMMON_START, DOWN, fmtDate, pct, UP } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * How often TQQQ and SOXL move together, as parallel categories (`parcats`): every trading day
 * since Mar 11, 2010 is a path from TQQQ's direction (Up / Down) through SOXL's direction to the
 * size of SOXL's move (under 2%, 2–5%, over 5%, in either direction). The 4,165 days are
 * aggregated into the 12 combinations with `counts`, categories are ordered with `categoryarray`,
 * and paths are colored by SOXL's direction (`line.color` through a two-stop `line.colorscale`),
 * so the ribbons that cross between the first two columns are the days the funds disagreed.
 * Hover gives counts and shares (`hovertemplate` for categories, `line.hovertemplate` for paths).
 * An unchanged close (TQQQ 10 days, SOXL 17) counts as Down.
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: moving together',
  description:
    'Parallel categories of every trading day since 2010: TQQQ up or down, SOXL up or down, and the size of SOXL’s move.',
  tags: ['demo', 'parcats', 'categorical', 'counts', 'colorscale', 'hover'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

type Dir = 'Up' | 'Down';
const SIZES = ['Over 5%', '2–5%', 'Under 2%'] as const;
type Size = (typeof SIZES)[number];

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const tqqq = COMMON_RETURNS.TQQQ.r;
  const soxl = COMMON_RETURNS.SOXL.r;
  const dir = (v: number): Dir => (v > 0 ? 'Up' : 'Down');
  const size = (v: number): Size => {
    const a = Math.abs(v);
    return a > 0.05 ? 'Over 5%' : a >= 0.02 ? '2–5%' : 'Under 2%';
  };

  const counts = new Map<string, number>();
  tqqq.forEach((t, i) => {
    const s = soxl[i] as number;
    const key = `${dir(t)}|${dir(s)}|${size(s)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const rows = [...counts].map(([key, n]) => {
    const [t, s, z] = key.split('|') as [Dir, Dir, Size];
    return { t, s, z, n };
  });
  const days = tqqq.length;
  // Category labels with their day counts.
  const total = (pick: (r: (typeof rows)[number]) => string, value: string): string =>
    rows
      .filter((r) => pick(r) === value)
      .reduce((a, r) => a + r.n, 0)
      .toLocaleString('en-US');
  const labelled = (values: readonly string[], pick: (r: (typeof rows)[number]) => string) =>
    values.map((v) => `${v}<br>${total(pick, v)}`);
  const together = rows.filter((r) => r.t === r.s).reduce((a, r) => a + r.n, 0) / days;

  const chart: Chart = createChart(chartEl, {
    data: [
      {
        type: 'parcats',
        counts: rows.map((r) => r.n),
        dimensions: [
          {
            label: 'TQQQ day',
            values: rows.map((r) => r.t),
            categoryarray: ['Up', 'Down'],
            ticktext: labelled(['Up', 'Down'], (r) => r.t),
          },
          {
            label: 'SOXL day',
            values: rows.map((r) => r.s),
            categoryarray: ['Up', 'Down'],
            ticktext: labelled(['Up', 'Down'], (r) => r.s),
          },
          {
            label: 'Size of SOXL’s move',
            values: rows.map((r) => r.z),
            categoryarray: SIZES,
            ticktext: labelled(SIZES, (r) => r.z),
          },
        ],
        line: {
          color: rows.map((r) => (r.s === 'Up' ? 1 : 0)),
          colorscale: [
            [0, DOWN],
            [1, UP],
          ],
          shape: 'hspline',
          hovertemplate: '<b>%{count:,} days</b> (%{probability:.1%} of all)<extra></extra>',
        },
        hoveron: 'category',
        hovertemplate: '%{category}: <b>%{count:,} days</b> (%{probability:.1%})<extra></extra>',
        labelfont: { size: 12, color: LOOK.title },
        tickfont: { size: 11, color: LOOK.text },
      },
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : `Same direction on ${pct(together, 1, false)} of ${days.toLocaleString('en-US')} ` +
            `trading days since ${fmtDate(COMMON_START)}`,
      },
      margin: { t: 72, l: 48, r: 72, b: 24 },
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
          text: 'Paths colored by SOXL’s direction: green up, red down',
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
