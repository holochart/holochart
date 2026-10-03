import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  COLOR,
  COMMON_RETURNS,
  COMMON_START,
  correlation,
  fmtDate,
  FUNDS,
  linreg,
  pct,
  UNDERLYING,
  type Fund,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * What "3×" means day to day: every trading day since SOXL's first (Mar 11, 2010) as one point,
 * the unleveraged ETF's return across and the 3× fund's down, one subplot per fund. The points sit
 * on a line so tight that a `histogram2dcontour` of the same days (contour lines colored by count,
 * in the fund's hue) is needed to show where most of them are: in a small cloud around zero. The
 * dashed line is y = 3x; the solid one is the least-squares fit (`linreg`), whose slope just under
 * 3 is the fees, financing and tracking drag — the leverage itself is reset every day, exactly.
 * Faint scatter markers draw above the contours (Plotly's layer order); two x/y axis pairs side by
 * side make the subplots, with the fit's equation in an annotation on each.
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: daily returns against 3× the index',
  description:
    'Every day since 2010: QQQ against TQQQ and SOXX against SOXL, with density contours, the y = 3x line and the least-squares fit.',
  tags: ['demo', 'histogram2dcontour', 'scatter', 'regression', 'subplots', 'financial'],
  size: { width: 960, height: 480 },
  testTolerance: 0.004,
};

/**
 * Half-width of each subplot's x range (y spans 3× that, so y = 3x is the diagonal): the bulk of
 * the days, leaving the two dozen most extreme ones (Mar 2020, Apr 2025, …) outside the view.
 */
const SPAN: Readonly<Record<Fund, number>> = { TQQQ: 0.05, SOXL: 0.07 };
/** Density bin width on the index axis (the fund axis uses 3× it). */
const BIN: Readonly<Record<Fund, number>> = { TQQQ: 0.005, SOXL: 0.007 };

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const traces: Record<string, unknown>[] = [];
  const annotations: Record<string, unknown>[] = [];
  const axes: Record<string, unknown> = {};

  FUNDS.forEach((fund, k) => {
    const ref = UNDERLYING[fund];
    const xr = COMMON_RETURNS[ref];
    const yr = COMMON_RETURNS[fund];
    const x = xr.r;
    const y = yr.r;
    const text = xr.dates.map(fmtDate);
    const fit = linreg(x, y);
    const r2 = correlation(x, y) ** 2;
    const s = SPAN[fund];
    const xa = k === 0 ? 'x' : 'x2';
    const ya = k === 0 ? 'y' : 'y2';
    const first = k === 0;
    const outside = x.filter((v, i) => Math.abs(v) > s || Math.abs(y[i] as number) > 3 * s).length;

    traces.push(
      {
        type: 'histogram2dcontour',
        name: `${fund} density`,
        x,
        y,
        xaxis: xa,
        yaxis: ya,
        xbins: { start: -s, end: s, size: BIN[fund] },
        ybins: { start: -3 * s, end: 3 * s, size: 3 * BIN[fund] },
        autocontour: false,
        contours: { coloring: 'lines', start: 50, end: 650, size: 100 },
        colorscale: [
          [0, COLOR[fund]],
          [1, '#ffffff'],
        ],
        showscale: false,
        line: { width: 1.5, smoothing: 1 },
        showlegend: false,
        hovertemplate: `${ref} %{x:+.1%}, ${fund} %{y:+.1%}<br>%{z} days in this bin<extra></extra>`,
      },
      {
        type: 'scatter',
        mode: 'markers',
        name: `${fund} vs ${ref}, one dot a day`,
        legendrank: k + 1,
        x,
        y,
        text,
        xaxis: xa,
        yaxis: ya,
        marker: { color: COLOR[ref], size: 2.5, opacity: 0.3 },
        hovertemplate: `%{text}<br>${ref} %{x:+.2%}<br>${fund} %{y:+.2%}<extra></extra>`,
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'y = 3x (exactly 3× the index)',
        legendgroup: 'three',
        legendrank: 3,
        showlegend: first,
        x: [-s, s],
        y: [-3 * s, 3 * s],
        xaxis: xa,
        yaxis: ya,
        line: { color: LOOK.text, width: 1, dash: 'dash' },
        hoverinfo: 'skip',
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'least-squares fit',
        legendgroup: 'fit',
        legendrank: 4,
        showlegend: first,
        x: [-s, s],
        y: [fit.b - fit.m * s, fit.b + fit.m * s],
        xaxis: xa,
        yaxis: ya,
        line: { color: LOOK.title, width: 1.25 },
        hovertemplate:
          `${fund} = ${fit.m.toFixed(3)} × ${ref} ${fit.b < 0 ? '−' : '+'} ` +
          `${Math.abs(fit.b * 100).toFixed(3)}% a day<extra></extra>`,
      },
    );

    const suffix = first ? '' : '2';
    axes[`xaxis${suffix}`] = {
      domain: first ? [0, 0.46] : [0.54, 1],
      range: [-s, s],
      tickformat: '.0%',
      zeroline: true,
      anchor: `y${suffix}`,
      title: { text: `${ref} daily return` },
    };
    axes[`yaxis${suffix}`] = {
      range: [-3 * s, 3 * s],
      tickformat: '.0%',
      zeroline: true,
      anchor: `x${suffix}`,
      title: { text: `${fund} daily return`, standoff: 4 },
    };
    annotations.push({
      xref: `x${suffix} domain`,
      yref: `y${suffix} domain`,
      x: 0.02,
      y: 0.98,
      xanchor: 'left',
      yanchor: 'top',
      align: 'left',
      showarrow: false,
      bgcolor: LOOK.bg,
      borderpad: 4,
      font: { size: 10, color: LOOK.text },
      text:
        `<span style="color:${COLOR[fund]}"><b>${fund}</b></span> = <b>${fit.m.toFixed(3)}</b> × ` +
        `${ref} ${fit.b < 0 ? '−' : '+'} ${pct(Math.abs(fit.b), 3, false)} a day<br>` +
        `R² ${r2.toFixed(4)} · ${x.length.toLocaleString('en-US')} days, ${outside} beyond the axes`,
    });
  });

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: {
        text: narrow ? '' : `Daily returns since ${fmtDate(COMMON_START)}: 3× the index, every day`,
      },
      hovermode: 'closest',
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      margin: { t: narrow ? 48 : 72, r: 16 },
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
