import { createChart, type Chart, type LayoutAnnotation } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  CORE,
  correlation,
  dailyReturns,
  fmtDate,
  HALVES,
  pct,
  PERIODS,
  quantile,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Every pair of daily returns among SPY, QQQ, DIA and IWM as the lower half of a scatter plot
 * matrix (`splom` with `showupperhalf: false` and `diagonal.visible: false`, so four dimensions
 * need three rows and three columns and no pair is drawn twice). One `splom` trace per half, teal
 * for 2022–24 and amber for 2024–26, with small translucent markers; one sample is one session
 * and hover lists all four returns of the day. Each cell is labelled with the pair's correlation
 * in each half (annotations in that cell's axes, in the half's color).
 *
 * The axes are clipped symmetrically to 1.2× the 99.5th percentile of each fund's absolute daily
 * return (`xaxisN.range` / `yaxisN.range`), so the few April 2025 days fall outside rather than
 * squashing the other 99% into the middle.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: daily returns, pair by pair',
  description:
    'A scatter plot matrix of SPY, QQQ, DIA and IWM daily returns, colored by half, with each pair’s correlation in both halves.',
  tags: ['demo', 'splom', 'statistical', 'annotations', 'hover', 'financial'],
  size: { width: 720, height: 640 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  // Symmetric axis half-range per fund, in percent, rounded up to half a percent.
  const half = CORE.map((t) => {
    const abs = dailyReturns(t).r.map((v) => Math.abs(v * 100));
    return Math.ceil(quantile(abs, 0.995) * 1.2 * 2) / 2;
  });

  const traces = HALVES.map((h) => {
    const series = CORE.map((t) => dailyReturns(t, h));
    const dates = (series[0] as (typeof series)[number]).dates;
    return {
      type: 'splom' as const,
      name: PERIODS[h].label,
      dimensions: CORE.map((t, k) => ({
        label: `${t} daily return`,
        values: (series[k] as (typeof series)[number]).r.map((v) => v * 100),
      })),
      showupperhalf: false,
      diagonal: { visible: false },
      text: dates.map(
        (d, i) =>
          `<b>${fmtDate(d)}</b><br>` +
          CORE.map(
            (t, k) => `${t} ${pct((series[k] as (typeof series)[number]).r[i] as number, 2)}`,
          ).join('<br>'),
      ),
      hovertemplate: '%{text}<extra></extra>',
      marker: { color: PERIODS[h].color, size: 3, opacity: 0.5 },
    };
  });

  // Lower half without the diagonal: columns are SPY, QQQ, DIA (x, x2, x3); rows QQQ, DIA, IWM
  // (y2, y3, y4).
  const axes: Record<string, unknown> = {};
  CORE.forEach((t, k) => {
    const common = {
      range: [-(half[k] as number), half[k] as number],
      ticksuffix: '%',
      nticks: narrow ? 3 : 5,
      zeroline: true,
      zerolinecolor: LOOK.zero,
      title: { text: `${t} daily return` },
    };
    if (k < CORE.length - 1) axes[k === 0 ? 'xaxis' : `xaxis${k + 1}`] = common;
    if (k > 0) axes[`yaxis${k + 1}`] = common;
  });
  const annotations = CORE.flatMap((rowFund, row) =>
    CORE.slice(0, row).flatMap((colFund, col) =>
      HALVES.map((h, k): LayoutAnnotation => ({
        xref: col === 0 ? 'x' : `x${col + 1}`,
        yref: `y${row + 1}`,
        x: -(half[col] as number) * 0.94,
        y: (half[row] as number) * 0.94,
        yshift: -k * 13,
        xanchor: 'left',
        yanchor: 'top',
        showarrow: false,
        text: `ρ ${correlation(colFund, rowFund, h).toFixed(2)}`,
        font: { size: 11, color: PERIODS[h].color },
      })),
    ),
  );

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: { text: narrow ? '' : 'Daily returns, pair by pair, with each half’s correlation ρ' },
      hovermode: 'closest',
      dragmode: 'zoom',
      legend: {
        orientation: 'h',
        x: 1,
        xanchor: 'right',
        y: 1.02,
        yanchor: 'bottom',
        itemsizing: 'constant',
      },
      ...axes,
      annotations,
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
