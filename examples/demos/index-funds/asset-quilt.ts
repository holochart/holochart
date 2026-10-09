import { createChart, type Chart, type HeatmapTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  COLOR,
  LABEL,
  pct,
  PERIODS,
  type Ticker,
  totalReturn,
  YEAR_SPANS,
  yearlyReturns,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The "periodic table of returns": eight asset classes ranked by total return within each calendar
 * year, best on top. A `heatmap` whose `z` is the asset's index rather than a quantity, colored
 * through a stepped `colorscale` (two stops per color, `zmin` / `zmax` half a step outside the
 * indexes), so every asset keeps one color and the eye can follow it from column to column. Each
 * cell prints what the asset is and its return (`texttemplate` reading `text`, with a line break,
 * black or white against the cell). A second heatmap on its own x axis (`xaxis2`, sharing the rank
 * axis) ranks the same assets over the four years.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: asset classes ranked year by year',
  description:
    'US large, growth and small-cap stocks, international stocks, bonds, long Treasuries, gold and cash ranked by total return in each calendar year from 2022 (Q4) to 2026 (to September).',
  tags: ['demo', 'heatmap', 'texttemplate', 'category', 'colorscale', 'discrete', 'financial'],
  size: { width: 960, height: 480 },
  testTolerance: 0.004,
};

const ASSETS: readonly Ticker[] = ['SPY', 'QQQ', 'IWM', 'VXUS', 'BND', 'TLT', 'GLD', 'BIL'];
/** One color per asset: the funds' own, and distinct hues for the other asset classes. */
const QUILT: Readonly<Record<string, string>> = {
  SPY: COLOR.SPY,
  QQQ: COLOR.QQQ,
  IWM: COLOR.IWM,
  VXUS: '#9962c0',
  BND: '#4b9fd8',
  TLT: '#128b8b',
  GLD: '#997600',
  BIL: '#70758a',
};
/** A stepped colorscale: asset `k` of `n` owns the band from `k / n` to `(k + 1) / n`. */
const STEPS: [number, string][] = ASSETS.flatMap((t, k): [number, string][] => [
  [k / ASSETS.length, QUILT[t] as string],
  [(k + 1) / ASSETS.length, QUILT[t] as string],
]);

interface Cell {
  t: Ticker;
  r: number;
}
/** The assets with their return, best first. */
const ranked = (of: (t: Ticker) => number): Cell[] =>
  ASSETS.map((t) => ({ t, r: of(t) })).sort((a, b) => b.r - a.r);

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const yearly = new Map(ASSETS.map((t) => [t, yearlyReturns(t)]));
  // columns[i][k]: the asset ranked k + 1 in year i.
  const columns = YEAR_SPANS.map((_, i) => ranked((t) => yearly.get(t)?.[i] ?? 0));
  const overall = ranked((t) => totalReturn(t));
  const ranks = ASSETS.map((_, k) => String(k + 1));
  const name = (t: Ticker): string => (narrow ? t : LABEL[t]);

  /** A heatmap of ranked columns: rows are ranks, `z` the asset's index. */
  const quilt = (
    cols: Cell[][],
    x: string[],
    periods: string[],
    axis: 'x' | 'x2',
    digits: number,
  ): HeatmapTrace => ({
    type: 'heatmap',
    name: axis === 'x' ? 'Calendar years' : 'Four years',
    xaxis: axis,
    yaxis: 'y',
    x,
    y: ranks,
    z: ranks.map((_, k) => cols.map((col) => ASSETS.indexOf((col[k] as Cell).t))),
    text: ranks.map((_, k) =>
      cols.map((col) => {
        const c = col[k] as Cell;
        return `${name(c.t)}<br>${pct(c.r, digits)}`;
      }),
    ),
    hovertext: ranks.map((_, k) =>
      cols.map((col, i) => {
        const c = col[k] as Cell;
        return (
          `<b>${c.t}</b> · ${LABEL[c.t]}<br>${periods[i] ?? ''}: <b>${pct(c.r, 1)}</b><br>` +
          `rank ${k + 1} of ${ASSETS.length}`
        );
      }),
    ),
    texttemplate: '%{text}',
    textfont: { size: narrow ? 8 : 11 },
    hovertemplate: '%{hovertext}<extra></extra>',
    colorscale: STEPS,
    zmin: -0.5,
    zmax: ASSETS.length - 0.5,
    showscale: false,
    xgap: narrow ? 2 : 4,
    ygap: narrow ? 2 : 4,
  });

  const years = YEAR_SPANS.map((s) => (narrow ? s.key : s.label));
  const axis = {
    type: 'category',
    side: 'top',
    tickfont: { size: narrow ? 9 : 11, color: LOOK.text },
    showgrid: false,
    ticks: '',
    fixedrange: true,
  } as const;
  const chart: Chart = createChart(chartEl, {
    data: [
      quilt(
        columns,
        years,
        YEAR_SPANS.map((s) => s.label),
        'x',
        1,
      ),
      quilt([overall], [narrow ? '4 yrs' : 'Four years'], [PERIODS.all.label], 'x2', 0),
    ],
    layout: {
      title: { text: narrow ? '' : 'Eight asset classes ranked by total return, year by year' },
      margin: { t: narrow ? 30 : 64, l: narrow ? 30 : 64, r: narrow ? 8 : 20, b: 16 },
      xaxis: { ...axis, domain: [0, 0.82] },
      xaxis2: { ...axis, domain: [0.84, 1], anchor: 'y' },
      yaxis: {
        type: 'category',
        autorange: 'reversed',
        title: { text: narrow ? '' : 'Rank' },
        tickvals: ranks,
        ticktext: ranks.map((r, k) =>
          narrow ? r : k === 0 ? 'Best' : k === ranks.length - 1 ? 'Worst' : r,
        ),
        showgrid: false,
        ticks: '',
        fixedrange: true,
      },
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
