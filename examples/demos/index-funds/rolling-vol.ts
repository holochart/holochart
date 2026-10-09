import {
  createChart,
  type Chart,
  type FigureInput,
  type LayoutAnnotation,
  type ScatterTrace,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLOR, CORE, fmtDate, rollingVol, share } from './analysis.mts';
import { chartConfig, frame, halfLabels, halfShapes, isNarrow, segmented, settled } from './ui.mts';

/**
 * Rolling annualized volatility of the four funds: the standard deviation of the daily total
 * returns of the trailing 63 sessions (a quarter) or 21 sessions (a month), times √252, as one
 * line per fund on a percent axis. The windows reach back before the four years, so every line
 * starts at the left edge. The last value of each line is labelled in the right margin (labels
 * closer than 13 px move apart), an arrow annotation marks the highest reading, and the halves are
 * marked with `halfShapes`. The toolbar's window toggle rebuilds the figure with `chart.react`.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: rolling volatility',
  description:
    '63- or 21-session rolling annualized volatility of SPY, QQQ, DIA and IWM from October 2022 to September 2026, with the two halves marked.',
  tags: ['demo', 'line', 'scatter', 'date', 'shapes', 'annotations', 'react', 'hover', 'financial'],
  size: { width: 960, height: 420 },
  testTolerance: 0.004,
};

type Window = '63' | '21';

function figure(window: Window, narrow: boolean, height: number): FigureInput {
  const lines = CORE.map((t) => ({ t, ...rollingVol(t, Number(window)) }));
  const top = Math.max(...lines.flatMap((l) => l.value));
  // Headroom for the peak's label.
  const yMax = Math.ceil((top + 0.06) * 20) / 20;

  const traces = lines.map(({ t, dates, value }): ScatterTrace => ({
    type: 'scatter',
    mode: 'lines',
    name: t,
    x: dates,
    y: value,
    line: { color: COLOR[t], width: t === 'SPY' ? 1.75 : 1.35 },
    hovertemplate: `${t}  %{y:.1%}<extra></extra>`,
  }));

  // Last values in the right margin, lowest first; a label less than 13 px above the one below
  // it moves up (the plot is about 150 px shorter than the chart).
  const pxPerUnit = Math.max(height - 150, 120) / yMax;
  const ends = lines
    .map(({ t, dates, value }) => ({ t, x: dates.at(-1) as string, v: value.at(-1) as number }))
    .sort((a, b) => a.v - b.v);
  const shifts: number[] = [];
  let previous = -Infinity;
  for (const e of ends) {
    const at = Math.max(e.v * pxPerUnit, previous + 13);
    shifts.push(at - e.v * pxPerUnit);
    previous = at;
  }
  const endLabels = ends.map((e, i): LayoutAnnotation => ({
    x: e.x,
    y: e.v,
    xref: 'x',
    yref: 'y',
    text: `${e.t} ${share(e.v)}`,
    showarrow: false,
    xanchor: 'left',
    xshift: 5,
    yshift: shifts[i] as number,
    font: { color: COLOR[e.t], size: 10 },
  }));

  // The highest reading of any fund.
  const peak = lines
    .map(({ t, dates, value }) => {
      const v = Math.max(...value);
      return { t, v, date: dates[value.indexOf(v)] as string };
    })
    .sort((a, b) => b.v - a.v)[0]!;
  const peakNote: LayoutAnnotation = {
    x: peak.date,
    y: peak.v,
    xref: 'x',
    yref: 'y',
    text: `${peak.t} ${share(peak.v)}, ${fmtDate(peak.date)}`,
    showarrow: true,
    arrowhead: 0,
    arrowwidth: 1,
    arrowcolor: COLOR[peak.t],
    ax: 0,
    ay: -14,
    yanchor: 'bottom',
    font: { color: COLOR[peak.t], size: 10 },
  };

  return {
    data: traces,
    layout: {
      title: {
        text: narrow ? '' : `Volatility over the trailing ${window} sessions, annualized`,
      },
      hovermode: 'x unified',
      margin: { r: narrow ? 56 : 72 },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: { type: 'date' },
      yaxis: {
        title: { text: 'Annualized volatility' },
        range: [0, yMax],
        tickformat: '.0%',
      },
      shapes: halfShapes(),
      annotations: [...halfLabels(), ...endLabels, ...(narrow ? [] : [peakNote])],
    },
    config: chartConfig(narrow),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const height = chartEl.clientHeight || 380;
  const chart: Chart = createChart(chartEl, figure('63', narrow, height));

  segmented<Window>(
    toolbar,
    'Window',
    [
      { value: '63', text: '63 sessions' },
      { value: '21', text: '21 sessions' },
    ],
    (value) => void chart.react(figure(value, narrow, height)),
  );

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
