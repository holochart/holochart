import { createChart, type Chart, type LayoutAnnotation, type LayoutShape } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  type Half,
  LABEL,
  pct,
  PERIODS,
  QUARTER_SPANS,
  quarterlyReturns,
  RETURN_SCALE,
  SECTORS,
  totalReturn,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The eleven S&P 500 sector funds quarter by quarter: a heatmap with a row per sector, sorted by
 * its four-year return (best on top), and a column per quarter, the return printed in every cell
 * (`texttemplate`, drawn black or white against the cell). The diverging `RETURN_SCALE` is
 * centered on 0 and capped at ±20% (`zmin` / `zmax`); the label still shows the true value. A
 * narrow second heatmap on its own x axis (`xaxis2`, sharing the y axis) gives each sector's
 * four-year total on a wider scale. A line divides the two halves, named above the grid over a
 * rule in each half's color.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: sector returns by quarter',
  description:
    'Quarterly total returns of the eleven S&P 500 sector funds from Q4 2022 to Q3 2026 as a labelled heatmap sorted by four-year return, with the two halves divided.',
  tags: ['demo', 'heatmap', 'texttemplate', 'category', 'colorbar', 'shapes', 'financial'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

/** Quarterly colors saturate at ±20%, four-year ones at ±250%. */
const CAP = 0.2;
const TOTAL_CAP = 2.5;
const SPLIT_AT = QUARTER_SPANS.findIndex((q) => q.half === 'second');
/** Share of the plot width taken by the quarters; the four-year column takes the rest. */
const GRID = 0.9;

/** A cell label: whole percent, and a plain `0%` where rounding would print `−0%`. */
const cellLabel = (r: number): string => (Math.round(r * 100) === 0 ? '0%' : pct(r, 0));

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const n = QUARTER_SPANS.length;

  const sectors = SECTORS.map((t) => ({ t, total: totalReturn(t), q: quarterlyReturns(t) })).sort(
    (a, b) => b.total - a.total,
  );
  const names = sectors.map((s) => (narrow ? s.t : LABEL[s.t]));
  const cell = { xgap: 2, ygap: 2, textfont: { size: narrow ? 7 : 10 } };

  const headY = 1.025;
  // Paper x of a column edge of the quarters' grid.
  const edge = (column: number): number => ((column + 0.5) / n) * GRID;
  const halfRule = (x0: number, x1: number, half: Half): LayoutShape => ({
    type: 'line',
    xref: 'paper',
    yref: 'paper',
    x0,
    x1,
    y0: headY,
    y1: headY,
    line: { color: PERIODS[half].color, width: 2 },
  });
  const halfName = (x: number, half: Half): LayoutAnnotation => ({
    xref: 'paper',
    yref: 'paper',
    x,
    y: headY,
    xanchor: 'center',
    yanchor: 'bottom',
    yshift: 3,
    showarrow: false,
    text: narrow
      ? `<b>${PERIODS[half].short}</b>`
      : `<b>${PERIODS[half].short}</b>  ${PERIODS[half].label}`,
    font: { color: PERIODS[half].color, size: 11 },
  });
  const split = edge(SPLIT_AT - 0.5);

  const chart: Chart = createChart(chartEl, {
    data: [
      {
        type: 'heatmap',
        name: 'Quarterly return',
        x: QUARTER_SPANS.map((q) => q.label),
        y: names,
        z: sectors.map((s) => s.q),
        text: sectors.map((s) => s.q.map(cellLabel)),
        hovertext: sectors.map((s) =>
          s.q.map(
            (r, i) =>
              `<b>${s.t}</b> · ${LABEL[s.t]}<br>${QUARTER_SPANS[i]?.label ?? ''}: <b>${pct(r, 1)}</b>`,
          ),
        ),
        // Phones have no room for a label in every cell: color and hover carry the quarters.
        texttemplate: narrow ? '' : '%{text}',
        hovertemplate: '%{hovertext}<extra></extra>',
        colorscale: RETURN_SCALE,
        zmin: -CAP,
        zmax: CAP,
        colorbar: {
          title: { text: 'Quarterly<br>return' },
          tickvals: [-0.2, -0.1, 0, 0.1, 0.2],
          ticktext: ['≤ −20%', '−10%', '0%', '+10%', '≥ +20%'],
          thickness: 12,
          len: 1,
        },
        ...cell,
      },
      {
        type: 'heatmap',
        name: 'Four years',
        xaxis: 'x2',
        yaxis: 'y',
        x: [narrow ? '4 yrs' : 'Four<br>years'],
        y: names,
        z: sectors.map((s) => [s.total]),
        text: sectors.map((s) => [cellLabel(s.total)]),
        hovertext: sectors.map((s) => [
          `<b>${s.t}</b> · ${LABEL[s.t]}<br>${PERIODS.all.label}: <b>${pct(s.total, 1)}</b>`,
        ]),
        texttemplate: '%{text}',
        hovertemplate: '%{hovertext}<extra></extra>',
        colorscale: RETURN_SCALE,
        zmin: -TOTAL_CAP,
        zmax: TOTAL_CAP,
        showscale: false,
        ...cell,
      },
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : 'S&P 500 sector funds: total return by quarter, sorted by four-year return',
      },
      margin: { t: narrow ? 34 : 76, l: narrow ? 40 : 150, r: narrow ? 58 : 76, b: 44 },
      xaxis: {
        domain: [0, GRID],
        type: 'category',
        tickvals: QUARTER_SPANS.map((q) => q.label),
        ticktext: QUARTER_SPANS.map((q) =>
          narrow
            ? q.label.startsWith('Q1')
              ? `’${q.label.slice(5)}`
              : ''
            : q.label.replace(' ', '<br>'),
        ),
        tickfont: { size: 10 },
        showgrid: false,
        ticks: '',
        fixedrange: true,
      },
      xaxis2: {
        domain: [GRID + 0.015, 1],
        anchor: 'y',
        type: 'category',
        tickfont: { size: 10 },
        showgrid: false,
        ticks: '',
        fixedrange: true,
      },
      yaxis: {
        type: 'category',
        autorange: 'reversed',
        showgrid: false,
        ticks: '',
        fixedrange: true,
      },
      shapes: [
        halfRule(0, split - 0.004, 'first'),
        halfRule(split + 0.004, GRID, 'second'),
        {
          type: 'line',
          xref: 'paper',
          yref: 'paper',
          x0: split,
          x1: split,
          y0: 0,
          y1: headY,
          line: { color: LOOK.title, width: 1.5 },
        },
      ],
      annotations: [halfName(split / 2, 'first'), halfName((split + GRID) / 2, 'second')],
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
