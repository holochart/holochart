import { createChart, type Chart, type LayoutAnnotation, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLOR, CORE, drawdowns, EVENTS, fmtDate, type MarketEvent, pct } from './analysis.mts';
import {
  chartConfig,
  frame,
  halfLabels,
  halfShapes,
  isNarrow,
  LOOK,
  rgba,
  settled,
} from './ui.mts';

/**
 * Underwater chart: how far each of the four funds closed below its previous all-time high on
 * every session of the four years (the highs of 2021–22 count, so the series start deep in the
 * 2022 bear market). SPY is a translucent area (`fill: 'tozeroy'`, the shaded height is the loss),
 * the other three are lines over it. The dated turning points (`EVENTS`) are arrow annotations
 * whose head sits on SPY's value that day and whose tail is in a band above the zero line, set in
 * axis units (`ayref: 'y'`) so the labels keep their row at any size; the rows alternate so
 * neighbours do not collide, and of two events within a few sessions only the deeper is labelled.
 * A marker trace on the same points carries each event's one-sentence note in the hover label.
 * Narrow containers keep the two deepest. The two halves are marked with `halfShapes`.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: drawdowns from the high',
  description:
    'How far SPY, QQQ, DIA and IWM closed below their previous highs from October 2022 to September 2026, with the dated turning points annotated on SPY.',
  tags: ['demo', 'area', 'fill', 'line', 'date', 'annotations', 'shapes', 'hover', 'financial'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

/** Events closer than this many sessions share one label: the deeper one. */
const NEAR = 10;
/** The label rows above the zero line, in axis units (fractions below the high, so above 0). */
const ROWS = [0.035, 0.09];
const TOP = 0.15;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const series = CORE.map((t) => ({ t, ...drawdowns(t) }));
  const spy = series[0]!;
  const floor = Math.min(...series.flatMap((s) => s.dd));

  const traces = series.map(({ t, dates, dd }): ScatterTrace => ({
    type: 'scatter',
    mode: 'lines',
    name: t,
    x: dates,
    y: dd,
    ...(t === 'SPY' ? { fill: 'tozeroy', fillcolor: rgba(COLOR.SPY, 0.3) } : {}),
    line: { color: COLOR[t], width: t === 'SPY' ? 1.5 : 1.1 },
    hovertemplate: `${t}  %{y:.1%}<extra></extra>`,
  }));

  // SPY's drawdown on each event's day; of two events a few sessions apart, the deeper stays.
  const dated = EVENTS.map((e) => {
    const i = spy.dates.indexOf(e.date);
    return { e, i, dd: spy.dd[i] as number };
  }).filter((d) => d.i >= 0);
  let shown = dated.filter(
    (d) => !dated.some((o) => o !== d && Math.abs(o.i - d.i) <= NEAR && o.dd < d.dd),
  );
  if (narrow) shown = [...shown].sort((a, b) => a.dd - b.dd).slice(0, 2);
  shown.sort((a, b) => a.i - b.i);

  const markers: ScatterTrace = {
    type: 'scatter',
    mode: 'markers',
    name: 'Turning points (on SPY)',
    x: shown.map((d) => d.e.date),
    y: shown.map((d) => d.dd),
    customdata: shown.map((d) => [d.e.label, wrap(d.e), fmtDate(d.e.date)]),
    marker: { color: LOOK.title, size: 6, line: { color: LOOK.bg, width: 1 } },
    showlegend: false,
    hovertemplate:
      '<b>%{customdata[0]}</b>, %{customdata[2]}<br>%{customdata[1]}<br>SPY %{y:.1%} from its high<extra></extra>',
  };

  const notes = shown.map((d, k): LayoutAnnotation => ({
    x: d.e.date,
    y: d.dd,
    xref: 'x',
    yref: 'y',
    text: `${d.e.label}<br>${d.dd > -0.0005 ? 'at a high' : pct(d.dd, 1)}`,
    showarrow: true,
    arrowhead: 0,
    arrowwidth: 1,
    arrowcolor: rgba(LOOK.title, 0.55),
    axref: 'x',
    ax: d.e.date,
    ayref: 'y',
    ay: ROWS[k % ROWS.length] as number,
    yanchor: 'bottom',
    font: { color: LOOK.title, size: 10 },
  }));

  const chart: Chart = createChart(chartEl, {
    data: [...traces, markers],
    layout: {
      title: { text: narrow ? '' : 'Below the previous high, day by day' },
      hovermode: 'x unified',
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      margin: { r: narrow ? 16 : 32 },
      xaxis: { type: 'date' },
      yaxis: {
        title: { text: 'Below the high' },
        range: [Math.floor(floor * 20) / 20 - 0.02, TOP],
        tickvals: [0, -0.1, -0.2, -0.3, -0.4].filter((v) => v > floor - 0.05),
        tickformat: '.0%',
        zeroline: true,
      },
      shapes: halfShapes(),
      // The halves' names go to the bottom of the bands: the top holds the event labels.
      annotations: [...halfLabels('x', 'y domain', false, 0.075), ...notes],
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

/** An event's note broken into lines of about 48 characters, for the hover label. */
function wrap(e: MarketEvent): string {
  const lines: string[] = [];
  let line = '';
  for (const word of e.note.split(' ')) {
    if (line && line.length + word.length + 1 > 48) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.join('<br>');
}
