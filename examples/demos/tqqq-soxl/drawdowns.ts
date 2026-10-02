import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  COLOR,
  COMMON_START,
  DASH,
  drawdown,
  fmtDate,
  FUNDS,
  type Fund,
  growthOf,
  pct,
  type Ticker,
  UNDERLYING,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, settled } from './ui.mts';

/**
 * Underwater chart: how far each ticker sat below its own running high on every day since SOXL's
 * first day (Mar 11, 2010). Two rows share one date axis (`xaxis2.matches: 'x'`): the Nasdaq-100
 * family on top, semiconductors below. The 3× funds are translucent areas (`fill: 'tozeroy'`, so
 * the shaded height is the loss), their unleveraged references thin dashed lines over them. An
 * arrow annotation marks each fund's deepest point; `hovermode: 'x unified'` lists the row's two
 * tickers on a date.
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: drawdowns since 2010',
  description:
    'Drawdown from the running peak of TQQQ and SOXL as filled areas, QQQ and SOXX as dashed lines, on two rows with the deepest points marked.',
  tags: ['demo', 'area', 'fill', 'line', 'subplots', 'matches', 'annotations', 'date', 'financial'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

/** `#rrggbb` → `rgba(r, g, b, a)`. */
function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Row of each index family: 1 = top (Nasdaq-100), 2 = bottom (semiconductors). */
const ROW: Record<Fund, 1 | 2> = { TQQQ: 1, SOXL: 2 };
const FAMILY: Record<Fund, string> = { TQQQ: 'Nasdaq-100', SOXL: 'Semiconductors' };

interface Underwater {
  dates: readonly string[];
  dd: number[];
  /** Index of the deepest point. */
  trough: number;
}

function underwater(t: Ticker): Underwater {
  const g = growthOf(t, 1, COMMON_START);
  const dd = drawdown(g.adj);
  let trough = 0;
  dd.forEach((v, i) => {
    if (v < (dd[trough] as number)) trough = i;
  });
  return { dates: g.dates, dd, trough };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const data: Record<string, unknown>[] = [];
  const annotations: Record<string, unknown>[] = [];
  for (const fund of FUNDS) {
    const row = ROW[fund];
    const axes = { xaxis: row === 1 ? 'x' : 'x2', yaxis: row === 1 ? 'y' : 'y2' };
    const ref = UNDERLYING[fund];
    const u = underwater(fund);
    const r = underwater(ref);
    data.push(
      {
        type: 'scatter',
        mode: 'lines',
        name: fund,
        ...axes,
        x: u.dates,
        y: u.dd,
        fill: 'tozeroy',
        fillcolor: rgba(COLOR[fund], 0.35),
        line: { color: COLOR[fund], width: 1 },
        hovertemplate: `${fund}  %{y:.1%}<extra></extra>`,
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: ref,
        ...axes,
        x: r.dates,
        y: r.dd,
        line: { color: COLOR[ref], width: 1.25, dash: DASH[ref] },
        hovertemplate: `${ref}  %{y:.1%}<extra></extra>`,
      },
    );
    const at = u.dates[u.trough] as string;
    annotations.push(
      {
        ...{ xref: axes.xaxis, yref: axes.yaxis },
        x: at,
        y: u.dd[u.trough],
        text: `${fund} ${pct(u.dd[u.trough] as number)}<br>${fmtDate(at)}`,
        showarrow: true,
        arrowhead: 2,
        arrowcolor: COLOR[fund],
        ax: -72,
        ay: 4,
        xanchor: 'right',
        align: 'right',
        font: { color: COLOR[fund], size: 10 },
      },
      {
        // Row caption, top left inside the plot.
        xref: 'paper',
        yref: row === 1 ? 'y domain' : 'y2 domain',
        x: 0.005,
        y: 0.04,
        xanchor: 'left',
        yanchor: 'bottom',
        text: `${FAMILY[fund]}: ${fund} (3×) and ${ref}, deepest ${pct(r.dd[r.trough] as number)}`,
        showarrow: false,
        font: { size: 10 },
      },
    );
  }

  const yaxis = {
    range: [-1, 0.04],
    tickformat: '.0%',
    dtick: 0.25,
    zeroline: true,
  };
  const chart: Chart = createChart(chartEl, {
    data,
    layout: {
      title: {
        text: narrow ? '' : `Drawdown from the running high since ${fmtDate(COMMON_START)}`,
      },
      hovermode: 'x unified',
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: { type: 'date', anchor: 'y', showticklabels: false },
      xaxis2: { type: 'date', anchor: 'y2', matches: 'x' },
      yaxis: { ...yaxis, domain: [0.53, 1], title: { text: 'Below high' } },
      yaxis2: { ...yaxis, domain: [0, 0.47], title: { text: 'Below high' } },
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
