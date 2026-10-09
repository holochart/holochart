import {
  createChart,
  type BarTrace,
  type Chart,
  type LayoutAnnotation,
  type ScatterTrace,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { CORE, DOWN, episodes, fmtDate, LABEL, LAST_DATE, pct } from './analysis.mts';
import { chartConfig, frame, halfLabels, halfShapes, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Every fall of 5% or more from an all-time high that was under way during the four years, as a
 * timeline: one row per fund, one horizontal bar per episode from the day of the high to the first
 * close back above it (`bar` with `orientation: 'h'`, the high's date as `base` and the duration
 * in milliseconds as `x`, on a date axis). The bars are colored by depth on a sequential
 * `marker.colorscale` with a colorbar; a `scatter` trace of diamonds marks each low, with the
 * depth as text above the bar. An episode that had not recovered by the last close runs to it and gets
 * a white outline and a note in the margin. The first bars start before the four years, at the
 * highs of late 2021 and early 2022; the halves' bands (`halfShapes`) show where the four years
 * begin and split.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: every fall of 5% or more',
  description:
    'A timeline of every drawdown of at least 5% in SPY, QQQ, DIA and IWM that touched the four years: from the high to the recovery, colored by depth, with the low marked.',
  tags: [
    'demo',
    'bar',
    'horizontal',
    'base',
    'gantt',
    'date',
    'colorscale',
    'colorbar',
    'scatter',
    'text',
    'financial',
  ],
  size: { width: 960, height: 420 },
  testTolerance: 0.004,
};

const DAY = 86_400_000;
/** On narrow containers only falls at least this deep get their depth as text. */
const NARROW_LABEL = -0.15;
/** Bar thickness, in rows. */
const BAR = 0.42;
/** Shallow falls dim, deep ones bright red: reads on the dark background at both ends. */
const DEPTH_SCALE: [number, string][] = [
  [0, '#5a4a6e'],
  [0.35, '#a8506a'],
  [0.7, DOWN],
  [1, '#ff9a7a'],
];

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const rows = CORE.flatMap((t, row) =>
    episodes(t).map((e) => ({ t, row, ...e, end: e.recovery ?? LAST_DATE })),
  );
  const deepest = Math.max(...rows.map((r) => -r.depth));
  const cmax = Math.ceil(deepest * 20) / 20;
  const first = rows.reduce((a, r) => (r.peak < a ? r.peak : a), LAST_DATE);

  const bars: BarTrace = {
    type: 'bar',
    orientation: 'h',
    name: 'Fall and recovery',
    y: rows.map((r) => r.row),
    base: rows.map((r) => r.peak),
    x: rows.map((r) => Date.parse(r.end) - Date.parse(r.peak)),
    width: BAR,
    customdata: rows.map((r) => [
      r.t,
      pct(r.depth, 1),
      fmtDate(r.peak),
      fmtDate(r.trough),
      r.down,
      r.recovery
        ? `back above the high on ${fmtDate(r.recovery)}, ${r.up} sessions after the low`
        : `not back at the high by ${fmtDate(LAST_DATE)}`,
    ]),
    marker: {
      color: rows.map((r) => -r.depth),
      colorscale: DEPTH_SCALE,
      cmin: 0.05,
      cmax,
      showscale: !narrow,
      colorbar: {
        title: { text: 'Depth at the low', side: 'right' },
        tickformat: '.0%',
        tickprefix: '−',
        thickness: 12,
        len: 0.8,
      },
      line: {
        color: rows.map((r) => (r.recovery ? LOOK.bg : LOOK.title)),
        width: rows.map((r) => (r.recovery ? 1 : 1.25)),
      },
    },
    hovertemplate:
      '<b>%{customdata[0]} %{customdata[1]}</b><br>high %{customdata[2]}<br>' +
      'low %{customdata[3]}, %{customdata[4]} sessions later<br>%{customdata[5]}<extra></extra>',
  };

  const lows: ScatterTrace = {
    type: 'scatter',
    mode: 'markers',
    name: 'Low',
    x: rows.map((r) => r.trough),
    y: rows.map((r) => r.row),
    marker: {
      symbol: 'diamond',
      size: 7,
      color: LOOK.title,
      line: { color: LOOK.bg, width: 1 },
    },
    hoverinfo: 'skip',
  };
  // The depth, over the bar above its low (the y axis runs top-down, so "above" is a smaller y).
  const depths: ScatterTrace = {
    type: 'scatter',
    mode: 'text',
    name: 'Depth',
    x: rows.map((r) => r.trough),
    y: rows.map((r) => r.row - BAR / 2 - 0.13),
    // Phones: only the deep ones, the bars of the shallow ones are too close for labels.
    text: rows.map((r) => (narrow && r.depth > NARROW_LABEL ? '' : pct(r.depth))),
    textposition: 'middle center',
    textfont: { size: narrow ? 9 : 10, color: LOOK.title },
    hoverinfo: 'skip',
  };

  // Episodes still open at the last close: a note in the right margin.
  const open = rows
    .filter((r) => !r.recovery)
    .map((r): LayoutAnnotation => ({
      xref: 'x',
      yref: 'y',
      x: LAST_DATE,
      y: r.row,
      text: 'not yet<br>recovered',
      showarrow: false,
      xanchor: 'left',
      align: 'left',
      xshift: 5,
      font: { size: 9, color: LOOK.text },
    }));

  // A month of room on both sides of the bars.
  const from = new Date(Date.parse(first) - 40 * DAY).toISOString().slice(0, 10);
  const to = new Date(Date.parse(LAST_DATE) + (narrow ? 20 : 75) * DAY).toISOString().slice(0, 10);

  const chart: Chart = createChart(chartEl, {
    data: [bars, lows, depths],
    layout: {
      title: {
        text: narrow
          ? ''
          : 'Every fall of 5% or more: from the high, through the low, to the recovery',
      },
      showlegend: false,
      hovermode: 'closest',
      barmode: 'overlay',
      margin: { l: narrow ? 44 : 96, r: narrow ? 12 : 24 },
      xaxis: { type: 'date', range: [from, to], showgrid: true },
      yaxis: {
        tickvals: CORE.map((_, i) => i),
        ticktext: CORE.map((t) => (narrow ? t : `<b>${t}</b><br>${LABEL[t]}`)),
        showgrid: false,
        zeroline: false,
        range: [CORE.length - 0.4, -0.7],
      },
      shapes: halfShapes(),
      annotations: [...halfLabels('x', 'y domain', false, 0.075), ...(narrow ? [] : open)],
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
