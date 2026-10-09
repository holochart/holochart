import {
  createChart,
  type BarTrace,
  type Chart,
  type LayoutAnnotation,
  type LayoutShape,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { HALVES, type Half, LABEL, pct, PERIODS, SECTORS, totalReturn } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Total return of the eleven S&P 500 sector funds in each half of the four years, as horizontal
 * grouped bars (`orientation: 'h'`, `barmode: 'group'`): the first half teal, the second amber,
 * the rows sorted by the four-year return (best on top, a reversed category axis). Every bar
 * carries its value (`text` with a per-bar `textposition`: inside the bar's end, or past it where
 * the bar is too short), and the S&P 500's own return in each half is a dashed vertical line in
 * that half's color (`shapes` on the x axis over the plot height, `layer: 'below'`, labelled by
 * annotations): a bar that covers its line beat the index in that half.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: sector returns in each half',
  description:
    'Total return of the eleven S&P 500 sector funds in 2022–24 and in 2024–26 as horizontal grouped bars, with the S&P 500’s return in each half as a reference line.',
  tags: ['demo', 'bar', 'horizontal', 'grouped', 'text', 'shapes', 'annotations', 'financial'],
  size: { width: 960, height: 520 },
  testTolerance: 0.004,
};

const X_TICKS = [0, 0.25, 0.5, 0.75, 1];
/** Bars at least this long (a return of 8%; 20% on a phone) hold their label. */
const INSIDE_FROM = { wide: 0.08, narrow: 0.2 };

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const rows = SECTORS.map((t) => ({
    t,
    first: totalReturn(t, 'first'),
    second: totalReturn(t, 'second'),
    all: totalReturn(t, 'all'),
  })).sort((a, b) => b.all - a.all);
  const spy: Record<Half, number> = {
    first: totalReturn('SPY', 'first'),
    second: totalReturn('SPY', 'second'),
  };

  const insideFrom = narrow ? INSIDE_FROM.narrow : INSIDE_FROM.wide;
  const bars = HALVES.map((half): BarTrace => ({
    type: 'bar',
    orientation: 'h',
    name: PERIODS[half].short,
    y: rows.map((r) => LABEL[r.t]),
    x: rows.map((r) => r[half]),
    text: rows.map((r) => pct(r[half])),
    // Inside the bar's end, at full size (by default inside text shrinks to the bar's
    // thickness); past the end of a bar too short to hold it.
    textposition: rows.map((r) => (Math.abs(r[half]) >= insideFrom ? 'inside' : 'outside')),
    insidetextanchor: 'end',
    constraintext: 'none',
    insidetextfont: { color: LOOK.bg, size: 10 },
    outsidetextfont: { color: PERIODS[half].color, size: 10 },
    customdata: rows.map((r) => [r.t, pct(r.all), pct(r[half] - spy[half], 1)]),
    marker: { color: PERIODS[half].color, line: { width: 0 } },
    hovertemplate:
      `<b>%{customdata[0]} · %{y}</b><br>${PERIODS[half].label}: %{x:+.1%}<br>` +
      '%{customdata[2]} against the S&P 500<br>four years: %{customdata[1]}<extra></extra>',
  }));

  const reference = HALVES.map((half): LayoutShape => ({
    type: 'line',
    xref: 'x',
    yref: 'y domain',
    x0: spy[half],
    x1: spy[half],
    y0: 0,
    y1: 1,
    line: { color: PERIODS[half].color, width: 1.25, dash: 'dash' },
    layer: 'below',
  }));
  const referenceLabels = HALVES.map((half): LayoutAnnotation => ({
    xref: 'x',
    yref: 'y domain',
    x: spy[half],
    y: 1,
    yanchor: 'bottom',
    showarrow: false,
    text: narrow ? `SPY ${pct(spy[half])}` : `S&P 500 ${pct(spy[half])} in ${PERIODS[half].short}`,
    font: { color: PERIODS[half].color, size: 10 },
  }));

  const chart: Chart = createChart(chartEl, {
    data: bars,
    layout: {
      title: { text: narrow ? '' : 'Sector total returns in each half, best four years on top' },
      barmode: 'group',
      bargap: 0.2,
      bargroupgap: 0.06,
      margin: { t: narrow ? 64 : 64, l: narrow ? 118 : 150, r: narrow ? 16 : 32 },
      // In the empty corner under the short bars; above the plot on a phone.
      legend: narrow
        ? { orientation: 'h', x: 0, y: 1.07, yanchor: 'bottom' }
        : {
            x: 0.99,
            xanchor: 'right',
            y: 0.02,
            yanchor: 'bottom',
            bgcolor: LOOK.bg,
            bordercolor: LOOK.axis,
            borderwidth: 1,
          },
      xaxis: {
        title: { text: 'Total return, dividends reinvested' },
        tickvals: X_TICKS.filter((v) => !narrow || v % 0.5 === 0),
        ticktext: X_TICKS.filter((v) => !narrow || v % 0.5 === 0).map((v) =>
          v === 0 ? '0%' : pct(v),
        ),
        range: [narrow ? -0.2 : -0.1, 1.08],
        zeroline: true,
      },
      yaxis: { type: 'category', autorange: 'reversed', showgrid: false },
      shapes: reference,
      annotations: referenceLabels,
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
