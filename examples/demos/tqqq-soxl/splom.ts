import { createChart, type Chart, type LayoutAnnotation } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  COMMON_RETURNS,
  COMMON_START,
  correlation,
  fmtDate,
  linreg,
  pct,
  type Ticker,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Every pair of daily returns among QQQ, TQQQ, SOXX and SOXL since Mar 11, 2010, as the lower half
 * of a scatter plot matrix (`splom` with `showupperhalf: false` and `diagonal.visible: false`, so
 * four dimensions need three rows and three columns and no pair is drawn twice). The four series
 * share one calendar, so one sample is one trading day; small translucent markers are colored by
 * year through a colorscale with a colorbar, and hover lists all four returns of the day. Each
 * cell is labelled with its Pearson correlation ρ and the least-squares slope β of the row's
 * return on the column's (an annotation in that cell's axes).
 *
 * The fund-vs-own-index cells are nearly straight lines of slope 3 (daily rebalancing), the
 * cross-index cells are clouds. The axes are clipped symmetrically to 1.2× the 99.5th percentile of
 * each series' absolute daily return (`xaxisN.range` / `yaxisN.range`), so the few crash days
 * (Mar 2020, Apr 2025) fall outside rather than squashing the other 99% into the middle.
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: daily returns, pair by pair',
  description:
    'A scatter plot matrix of QQQ, TQQQ, SOXX and SOXL daily returns since 2010, colored by year, with correlations.',
  tags: ['demo', 'splom', 'statistical', 'colorscale', 'colorbar', 'annotations', 'hover'],
  size: { width: 800, height: 800 },
  testTolerance: 0.004,
};

const DIMS: readonly Ticker[] = ['QQQ', 'TQQQ', 'SOXX', 'SOXL'];

/** Symmetric axis half-range: 1.2× the 99.5th percentile of |r|, rounded up to a whole percent. */
function clip(values: readonly number[]): number {
  const abs = values.map(Math.abs).sort((a, b) => a - b);
  return Math.ceil((abs[Math.floor(abs.length * 0.995)] as number) * 1.2);
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const dates = COMMON_RETURNS.QQQ.dates;
  const values = DIMS.map((t) => COMMON_RETURNS[t].r.map((v) => v * 100));
  const years = dates.map((d) => Number(d.slice(0, 4)));
  const text = dates.map(
    (d, i) =>
      `<b>${fmtDate(d)}</b><br>` +
      DIMS.map((t, k) => `${t} ${pct((values[k]![i] as number) / 100)}`).join('<br>'),
  );
  const half = values.map(clip);

  // Lower half without the diagonal: columns are QQQ, TQQQ, SOXX (x, x2, x3); rows TQQQ, SOXX,
  // SOXL (y2, y3, y4).
  const axes: Record<string, unknown> = {};
  DIMS.forEach((t, k) => {
    const common = {
      range: [-half[k]!, half[k]!],
      ticksuffix: '%',
      zeroline: true,
      zerolinecolor: LOOK.zero,
      title: { text: `${t} daily return` },
    };
    if (k < DIMS.length - 1) axes[k === 0 ? 'xaxis' : `xaxis${k + 1}`] = common;
    if (k > 0) axes[`yaxis${k + 1}`] = common;
  });
  const annotations = DIMS.flatMap((_, row) =>
    DIMS.slice(0, row).map((__, col): LayoutAnnotation => ({
      xref: col === 0 ? 'x' : `x${col + 1}`,
      yref: `y${row + 1}`,
      x: -half[col]! * 0.92,
      y: half[row]! * 0.92,
      xanchor: 'left',
      yanchor: 'top',
      showarrow: false,
      text:
        `ρ ${correlation(values[col]!, values[row]!).toFixed(3)}<br>` +
        `β ${linreg(values[col]!, values[row]!).m.toFixed(2)}`,
      align: 'left',
      font: { size: 11, color: LOOK.title },
    })),
  );

  const chart: Chart = createChart(chartEl, {
    data: [
      {
        type: 'splom',
        name: 'Trading days',
        dimensions: DIMS.map((t, k) => ({ label: `${t} daily return`, values: values[k] })),
        showupperhalf: false,
        diagonal: { visible: false },
        text,
        hovertemplate: '%{text}<extra></extra>',
        marker: {
          color: years,
          size: 3,
          opacity: 0.45,
          showscale: true,
          colorbar: { title: { text: 'Year' }, thickness: 10, len: 0.6, y: 0.7, tickformat: 'd' },
        },
      },
    ],
    layout: {
      title: {
        text: narrow ? '' : `Daily returns, pair by pair, since ${fmtDate(COMMON_START)}`,
      },
      hovermode: 'closest',
      dragmode: 'zoom',
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
