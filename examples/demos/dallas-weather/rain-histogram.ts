import {
  createChart,
  type Chart,
  type FigureInput,
  type HistogramTrace,
  type LayoutAnnotation,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { DATE, fmtDate, N, PRCP, RAIN } from './analysis.mts';
import { count } from './rain.mts';
import { chartConfig, frame, isNarrow, LOOK, segmented, settled } from './ui.mts';

/**
 * How much rain falls on a rainy day: a `histogram` of every day with at least 0.01 in, in
 * quarter-inch bins (`xbins`), on a log count axis (`yaxis.type: 'log'`) so the rare downpours at
 * the right stay visible next to the thousands of light-rain days at the left. Annotations give
 * the share of rainy days under a quarter inch and name the wettest day of the record. The
 * toolbar toggle switches the count axis between log and linear with `chart.relayout`.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: how much rain falls on a rainy day',
  description:
    'Histogram of daily rain amounts on rainy days since 1939 in quarter-inch bins, on a log or linear count axis.',
  tags: ['demo', 'histogram', 'xbins', 'log', 'annotations', 'relayout'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

/** Bin width, inches, and the smallest amount that counts as a rainy day. */
const BIN = 0.25;
const WET = 0.01;
const LOG_TICKS = [1, 10, 100, 1000];

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const amounts: number[] = [];
  let top = 0;
  for (let i = 0; i < N; i++) {
    const p = PRCP[i];
    if (p === null || p === undefined || p < WET) continue;
    amounts.push(p);
    if (p > (PRCP[top] ?? 0)) top = i;
  }
  const most = PRCP[top] as number;
  const light = amounts.filter((p) => p < BIN).length;
  const heavy = amounts.filter((p) => p >= 2).length;
  const end = (Math.floor(most / BIN) + 1) * BIN;
  const firstBin = light;
  const logRange = [-0.25, Math.log10(firstBin) + 0.35];

  const bars = {
    type: 'histogram',
    name: 'Rainy days',
    x: amounts,
    xbins: { start: 0, end, size: BIN },
    marker: { color: RAIN, line: { color: LOOK.bg, width: 1 } },
    hovertemplate: '%{x} in<br><b>%{y:,} days</b><extra></extra>',
  } satisfies HistogramTrace;

  const annotations = (log: boolean): LayoutAnnotation[] => [
    {
      xref: 'x',
      yref: 'y',
      x: (Math.floor(most / BIN) + 0.5) * BIN,
      y: log ? 0 : 1,
      text: `<b>${most.toFixed(2)} in</b> on ${fmtDate(DATE[top] as string)},<br>the wettest day on record`,
      showarrow: true,
      arrowhead: 0,
      arrowwidth: 1,
      arrowcolor: LOOK.tick,
      ax: -40,
      ay: -64,
      xanchor: 'right',
      align: 'right',
      font: { size: 10, color: LOOK.title },
    },
    {
      xref: 'x',
      yref: 'y',
      x: BIN,
      y: log ? Math.log10(firstBin) : firstBin,
      xanchor: 'left',
      yanchor: 'top',
      xshift: 8,
      align: 'left',
      showarrow: false,
      text:
        `<b>${Math.round((light / amounts.length) * 100)}%</b> of rainy days bring less than ${BIN} in.<br>` +
        `Only ${count(heavy)} of ${count(amounts.length)} brought 2 in or more.`,
      font: { size: 11, color: LOOK.title },
    },
  ];

  const yTitle = (log: boolean): string => (log ? 'Days (log scale)' : 'Days');
  const figure: FigureInput = {
    data: [bars],
    layout: {
      title: {
        text: narrow
          ? ''
          : `Rain on the ${count(amounts.length)} rainy days since ${fmtDate(DATE[0] as string)}`,
      },
      showlegend: false,
      bargap: 0,
      xaxis: {
        title: { text: 'Rain in one day, inches' },
        range: [0, end + BIN],
        dtick: 0.5,
        hoverformat: '.2f',
      },
      yaxis: { type: 'log', title: { text: yTitle(true) }, tickvals: LOG_TICKS, range: logRange },
      annotations: annotations(true),
    },
    config: chartConfig(narrow),
  };
  const chart: Chart = createChart(chartEl, figure);

  segmented(
    toolbar,
    'Y axis',
    [
      { value: 'log', text: 'Log' },
      { value: 'linear', text: 'Linear' },
    ],
    (value) => {
      const log = value === 'log';
      void chart.relayout({
        'yaxis.type': value,
        'yaxis.range': log ? logRange : null,
        'yaxis.autorange': !log,
        'yaxis.tickvals': log ? LOG_TICKS : null,
        'yaxis.title.text': yTitle(log),
        annotations: annotations(log),
      });
    },
    'log',
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
