import { createChart, type Chart, type LayoutAnnotation, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { BASE, COLOR, fmtDate, INDICATOR, mean, rollingVol, SPLIT, WINDOW } from './analysis.mts';
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
 * Expected against delivered volatility: the VIX close (the S&P 500's expected volatility over the
 * next 30 days, in percent a year) as a filled line (`fill: 'tozeroy'`), and over it the
 * annualized volatility SPY actually had over the trailing 21 sessions. The highest VIX closes are
 * arrow annotations with their date and value: the highest close, then the next highest at least
 * three months away from those already taken, so one spike is labelled once. The halves are marked
 * with `halfShapes`; `hovermode: 'x unified'` reads both lines on a date.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: the VIX and realized volatility',
  description:
    'The VIX close from October 2022 to September 2026 as a filled line with SPY’s trailing 21-day realized volatility over it and the highest closes labelled.',
  tags: ['demo', 'area', 'fill', 'line', 'date', 'annotations', 'shapes', 'hover', 'financial'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

/** The VIX: a violet that is none of the funds' hues. */
const VIX = '#a47be0';
/** Labelled spikes are at least this many sessions apart. */
const APART = 63;

/** Indexes of the highest closes, each at least `APART` sessions from the ones before. */
function spikes(v: readonly number[], count: number): number[] {
  const order = v.map((_, i) => i).sort((a, b) => (v[b] as number) - (v[a] as number));
  const out: number[] = [];
  for (const i of order) {
    if (out.length === count) break;
    if (out.every((o) => Math.abs(o - i) >= APART)) out.push(i);
  }
  return out;
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const vix = INDICATOR.VIX;
  const realized = rollingVol('SPY', 21);
  const top = Math.max(...vix);
  const split = SPLIT - BASE;
  const average = { first: mean(vix.slice(1, split + 1)), second: mean(vix.slice(split + 1)) };

  const traces: ScatterTrace[] = [
    {
      type: 'scatter',
      mode: 'lines',
      name: 'VIX (expected volatility)',
      x: WINDOW,
      y: vix,
      fill: 'tozeroy',
      fillcolor: rgba(VIX, 0.22),
      line: { color: VIX, width: 1.25 },
      hovertemplate: 'VIX  %{y:.1f}<extra></extra>',
    },
    {
      type: 'scatter',
      mode: 'lines',
      name: 'SPY, realized over the last 21 sessions',
      x: realized.dates,
      y: realized.value.map((v) => v * 100),
      line: { color: COLOR.SPY, width: 1.5 },
      hovertemplate: 'SPY realized  %{y:.1f}%<extra></extra>',
    },
  ];

  const labelled = spikes(vix, narrow ? 2 : 4).sort((a, b) => a - b);
  const notes = labelled.map((i, k): LayoutAnnotation => {
    const date = WINDOW[i] as string;
    const value = vix[i] as number;
    // Labels go to the side with more room: right of the spike only near the left edge.
    const left = i > vix.length * 0.4;
    return {
      x: date,
      y: value,
      xref: 'x',
      yref: 'y',
      text: `<b>${value.toFixed(1)}</b><br>${fmtDate(date)}`,
      showarrow: true,
      arrowhead: 0,
      arrowwidth: 1,
      arrowcolor: VIX,
      ax: (left ? -1 : 1) * (narrow ? 16 : 28),
      ay: k % 2 === 0 ? -6 : -14,
      xanchor: left ? 'right' : 'left',
      align: left ? 'right' : 'left',
      font: { color: LOOK.title, size: 10 },
    };
  });

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: {
        text: narrow
          ? ''
          : `The VIX averaged ${average.first.toFixed(1)} in the first half and ${average.second.toFixed(1)} in the second`,
      },
      hovermode: 'x unified',
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      margin: { r: narrow ? 16 : 32 },
      xaxis: { type: 'date' },
      yaxis: {
        title: { text: 'Volatility (% a year)' },
        range: [0, Math.ceil((top + 10) / 5) * 5],
        ticksuffix: '%',
        dtick: 10,
      },
      shapes: halfShapes(),
      annotations: [...halfLabels(), ...notes],
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
