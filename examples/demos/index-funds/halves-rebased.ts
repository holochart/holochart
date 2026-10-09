import {
  createChart,
  type Chart,
  type FigureInput,
  type LayoutAnnotation,
  type ScatterTrace,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  fmtDate,
  type Fund,
  FUNDS,
  growth,
  type Half,
  HALVES,
  LABEL,
  pct,
  PERIODS,
  usd,
} from './analysis.mts';
import { chartConfig, frame, fundPicker, isNarrow, LOOK, rgba, settled } from './ui.mts';

/**
 * The two halves of one fund laid over each other: both start at $10,000 on session 0 (the close
 * the half begins from) and run 501 sessions, the first half in teal and the second in amber, so
 * the x axis counts sessions since each half began instead of dates. `customdata` carries each
 * point's real date for the unified hover label; end labels and each half's lowest point are
 * annotations; a dotted `shape` marks the starting $10,000. The toolbar's fund picker swaps the
 * fund with `chart.react`.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: the two halves from the same start',
  description:
    'Growth of $10,000 in one fund over each half of the four years, both drawn from session 0, with a fund picker.',
  tags: ['demo', 'line', 'scatter', 'annotations', 'shapes', 'hover', 'react', 'financial'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

const START = 10_000;
/** A half's low is labelled when it is at least this far under the start. */
const LOW_LABEL = 0.03;

function figure(fund: Fund, narrow: boolean): FigureInput {
  const paths = HALVES.map((half) => ({ half, ...growth(fund, half, START) }));
  const sessions = paths[0]!.value.length - 1;

  const traces = paths.map(({ half, dates, value }): ScatterTrace => ({
    type: 'scatter',
    mode: 'lines',
    name: PERIODS[half].label,
    x: value.map((_, i) => i),
    y: value,
    customdata: dates.map(fmtDate),
    line: { color: PERIODS[half].color, width: 1.75 },
    hovertemplate: `${PERIODS[half].short}  %{customdata}  <b>%{y:$,.0f}</b><extra></extra>`,
  }));

  // End labels, lower one first; two closer than 4% move apart.
  const ends = paths
    .map(({ half, value }) => ({ half, v: value.at(-1) as number }))
    .sort((a, b) => a.v - b.v);
  const close = ends[1]!.v / ends[0]!.v < 1.04;
  const shift = (half: Half): number => (close ? (half === ends[0]!.half ? -7 : 7) : 0);
  const endLabels = ends.map(({ half, v }): LayoutAnnotation => ({
    x: sessions,
    y: v,
    xref: 'x',
    yref: 'y',
    text: narrow ? usd(v) : `${PERIODS[half].short}<br>${usd(v)} (${pct(v / START - 1)})`,
    showarrow: false,
    xanchor: 'left',
    align: 'left',
    xshift: 5,
    yshift: shift(half),
    font: { color: PERIODS[half].color, size: 10 },
  }));

  // The lowest point of each half, when it fell meaningfully under the start.
  const lows = paths.flatMap(({ half, dates, value }): LayoutAnnotation[] => {
    const low = Math.min(...value);
    if (narrow || low > START * (1 - LOW_LABEL)) return [];
    const i = value.indexOf(low);
    return [
      {
        x: i,
        y: low,
        xref: 'x',
        yref: 'y',
        text: `${usd(low)}, ${fmtDate(dates[i] as string)}`,
        showarrow: true,
        arrowhead: 0,
        arrowwidth: 1,
        arrowcolor: PERIODS[half].color,
        ax: 26,
        ay: 0,
        xanchor: 'left',
        font: { color: PERIODS[half].color, size: 10 },
      },
    ];
  });

  return {
    data: traces,
    layout: {
      title: {
        text: narrow ? '' : `${fund} (${LABEL[fund]}): $10,000 from the start of each half`,
      },
      hovermode: 'x unified',
      margin: { r: narrow ? 56 : 124 },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: {
        title: { text: 'Sessions since the half began' },
        range: [0, sessions],
        dtick: narrow ? 100 : 50,
        zeroline: false,
        hoverformat: 'd',
      },
      yaxis: { title: { text: 'Value (USD)' }, tickprefix: '$', tickformat: ',.0f' },
      shapes: [
        {
          type: 'line',
          xref: 'x domain',
          yref: 'y',
          x0: 0,
          x1: 1,
          y0: START,
          y1: START,
          layer: 'below',
          line: { color: rgba(LOOK.title, 0.45), width: 1, dash: 'dot' },
        },
      ],
      annotations: [...endLabels, ...lows],
    },
    config: chartConfig(narrow),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const chart: Chart = createChart(chartEl, figure('SPY', narrow));
  fundPicker<Fund>(toolbar, (fund) => void chart.react(figure(fund, narrow)), FUNDS);

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
