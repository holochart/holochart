import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  beta,
  correlation,
  ETFS,
  maxDrawdown,
  pct,
  PERIODS,
  totalReturn,
  volatility,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, settled } from './ui.mts';

/**
 * Every ETF of the demo as one line through parallel axes (`parcoords`): its total return in the
 * first half and in the second, its volatility and deepest drawdown over the four years, and its
 * beta to and correlation with SPY (daily returns). The first axis is the fund itself, an ordinal
 * axis (`tickvals` / `ticktext`) in the order of the four-year return, so every line can be traced
 * back to a ticker. Lines are colored by that four-year return (`line.color`, a colorscale and a
 * colorbar). The scale is sequential rather than the demo's red–green one: only one of the 27
 * funds lost money over the four years, so a scale centered on zero would spend half its range
 * on a single line. Drag along an axis to brush a range (`constraintrange`); the other lines dim.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: every ETF in parallel coordinates',
  description:
    'Parallel coordinates of 27 ETFs: return in each half, volatility, deepest drawdown, beta and correlation with SPY, colored by four-year return.',
  tags: ['demo', 'parcoords', 'colorscale', 'colorbar', 'statistical', 'financial'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

/** Dim violet → blue → green → yellow: every step readable on the dark background. */
const SCALE: [number, string][] = [
  [0, '#6a5acd'],
  [0.3, '#2f9fd6'],
  [0.65, '#3fc48a'],
  [1, '#f5e663'],
];
const COLOR_TICKS = [0, 0.5, 1, 1.5, 2];

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  // Lowest four-year return first, so the best fund is the top tick of the first axis.
  const rows = ETFS.map((t) => ({
    t,
    all: totalReturn(t, 'all'),
    first: totalReturn(t, 'first'),
    second: totalReturn(t, 'second'),
    vol: volatility(t, 'all'),
    drawdown: maxDrawdown(t, 'all').depth,
    beta: beta(t, 'all'),
    corr: correlation(t, 'SPY', 'all'),
  })).sort((a, b) => a.all - b.all);
  const col = (get: (r: (typeof rows)[number]) => number): number[] => rows.map(get);
  const signed = (ticks: readonly number[]): { tickvals: number[]; ticktext: string[] } => ({
    tickvals: [...ticks],
    ticktext: ticks.map((v) => (v === 0 ? '0%' : pct(v))),
  });

  const chart: Chart = createChart(chartEl, {
    data: [
      {
        type: 'parcoords',
        labelfont: { size: narrow ? 9 : 11 },
        tickfont: { size: 9 },
        line: {
          color: col((r) => r.all),
          colorscale: SCALE,
          cmin: -0.2,
          cmax: 2.4,
          showscale: !narrow,
          colorbar: {
            title: { text: 'Four-year total return', side: 'right' },
            ...signed(COLOR_TICKS),
            thickness: 12,
          },
        },
        dimensions: [
          {
            label: 'ETF',
            values: rows.map((_, i) => i),
            tickvals: rows.map((_, i) => i),
            ticktext: rows.map((r) => r.t),
            range: [-0.5, rows.length - 0.5],
          },
          {
            label: narrow ? '2022–24' : `Return ${PERIODS.first.short}`,
            values: col((r) => r.first),
            range: [-0.25, 1],
            ...signed([-0.25, 0, 0.25, 0.5, 0.75, 1]),
          },
          {
            label: narrow ? '2024–26' : `Return ${PERIODS.second.short}`,
            values: col((r) => r.second),
            range: [-0.25, 1],
            ...signed([-0.25, 0, 0.25, 0.5, 0.75, 1]),
          },
          {
            label: 'Volatility',
            values: col((r) => r.vol),
            range: [0, 0.26],
            tickvals: [0, 0.05, 0.1, 0.15, 0.2, 0.25],
            tickformat: '.0%',
          },
          {
            label: narrow ? 'Drawdown' : 'Deepest drawdown',
            values: col((r) => r.drawdown),
            range: [-0.3, 0],
            tickvals: [-0.3, -0.2, -0.1, 0],
            ticktext: ['−30%', '−20%', '−10%', '0%'],
          },
          {
            label: narrow ? 'Beta' : 'Beta to SPY',
            values: col((r) => r.beta),
            range: [-0.1, 1.5],
            tickvals: [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5],
            tickformat: '.2f',
          },
          {
            label: narrow ? 'Corr.' : 'Correlation with SPY',
            values: col((r) => r.corr),
            range: [-0.1, 1],
            tickvals: [0, 0.25, 0.5, 0.75, 1],
            tickformat: '.2f',
          },
        ],
      },
    ],
    layout: {
      title: {
        text: narrow ? '' : 'Every ETF on seven axes: returns, risk and how closely it follows SPY',
      },
      margin: { t: narrow ? 48 : 88, l: 48, r: narrow ? 28 : 120, b: 24 },
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
