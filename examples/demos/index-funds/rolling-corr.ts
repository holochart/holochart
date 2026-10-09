import { createChart, type Chart, type LayoutAnnotation, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLOR, LABEL, rollingCorr, type Ticker } from './analysis.mts';
import { chartConfig, frame, halfLabels, halfShapes, isNarrow, LOOK, settled } from './ui.mts';

/**
 * What moved with the S&P 500, and when: the correlation of SPY's daily returns with those of long
 * Treasuries (TLT), gold (GLD), small caps (IWM) and international stocks (VXUS) over the trailing
 * 63 sessions (a quarter), one line each on a date axis with a dash per line. The zero line is
 * emphasized (`zeroline`): above it the fund moved with the S&P 500, below it against. The two
 * halves are tinted bands with a dotted split line (`halfShapes` / `halfLabels`); end-of-line
 * labels are annotations and hover is unified across the four lines (`hovermode: 'x unified'`).
 */
export const meta: ExampleMeta = {
  title: 'Index funds: rolling correlation with the S&P 500',
  description:
    'The 63-session rolling correlation of SPY’s daily returns with long Treasuries, gold, small caps and international stocks, with the two halves marked.',
  tags: ['demo', 'line', 'date', 'rolling', 'shapes', 'annotations', 'hover', 'financial'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

const WINDOW_SESSIONS = 63;
const LINES: readonly { t: Ticker; color: string; dash: string }[] = [
  { t: 'IWM', color: COLOR.IWM, dash: 'solid' },
  { t: 'VXUS', color: '#9962c0', dash: 'dash' },
  { t: 'TLT', color: '#4b9fd8', dash: 'solid' },
  { t: 'GLD', color: '#c79a1e', dash: 'dashdot' },
];

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const series = LINES.map((line) => ({ ...line, ...rollingCorr('SPY', line.t, WINDOW_SESSIONS) }));
  const traces = series.map(({ t, color, dash, dates, value }): ScatterTrace => ({
    type: 'scatter',
    mode: 'lines',
    name: `${LABEL[t]} (${t})`,
    x: dates,
    y: value,
    line: { color, width: 1.75, dash },
    hovertemplate: `${LABEL[t]}  %{y:+.2f}<extra></extra>`,
  }));

  // End-of-line labels, lowest first; a label closer than 0.07 to the one below moves up.
  const finals = series
    .map(({ t, color, dates, value }) => ({
      t,
      color,
      x: dates.at(-1) as string,
      v: value.at(-1) as number,
    }))
    .sort((a, b) => a.v - b.v);
  const shift = new Map<Ticker, number>();
  finals.forEach((f, i) => {
    const below = finals[i - 1];
    if (below && f.v - below.v < 0.07) {
      shift.set(below.t, (shift.get(below.t) ?? 0) - 5);
      shift.set(f.t, 5);
    }
  });
  const ends = finals.map((f): LayoutAnnotation => ({
    x: f.x,
    y: f.v,
    xref: 'x',
    yref: 'y',
    text: `${f.t} ${f.v >= 0 ? '+' : '−'}${Math.abs(f.v).toFixed(2)}`,
    showarrow: false,
    xanchor: 'left',
    xshift: 4,
    yshift: shift.get(f.t) ?? 0,
    font: { color: f.color, size: 9 },
  }));

  const ticks = [-0.5, 0, 0.5, 1];
  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: {
        text: narrow
          ? ''
          : `Correlation with the S&P 500 (SPY) over the trailing ${WINDOW_SESSIONS} sessions`,
      },
      hovermode: 'x unified',
      margin: { r: narrow ? 56 : 80 },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: { type: 'date' },
      yaxis: {
        title: { text: 'Correlation of daily returns' },
        range: [-0.75, 1.08],
        tickvals: ticks,
        ticktext: ticks.map((v) =>
          v === 0 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`,
        ),
        zeroline: true,
        zerolinecolor: LOOK.tick,
        zerolinewidth: 1.5,
      },
      shapes: halfShapes(),
      annotations: [...halfLabels(), ...ends],
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
