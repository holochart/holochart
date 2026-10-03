import { createChart, type Chart, type FigureInput, type WaterfallTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { NORMAL_FROM, NORMAL_TO, NORMALS, RAIN } from './analysis.mts';
import { monthName, RAIN_LIGHT } from './rain.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * How a normal year's rain builds up, month by month: a `waterfall` with one rising step per
 * month (`measure: 'relative'`, the 1991–2020 average rain of that month) and a final total bar
 * for the year (`measure: 'total'`, its own color through `totals.marker`). Each step is labelled
 * with its inches (`text`, `textposition: 'outside'`), and hover adds the running total. The big
 * steps are May and October; July and August barely move the total.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: how a normal year of rain adds up',
  description:
    'Waterfall of the 1991–2020 average rain of each month, adding up to the total of a normal year.',
  tags: ['demo', 'waterfall', 'category', 'text', 'totals'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const total = NORMALS.reduce((a, n) => a + n.rain, 0);
  const running: number[] = [];
  NORMALS.reduce((a, n) => {
    running.push(a + n.rain);
    return a + n.rain;
  }, 0);
  const byRain = [...NORMALS].sort((a, b) => b.rain - a.rain);
  const top = byRain.slice(0, 2).sort((a, b) => a.month - b.month);
  const half = NORMALS[running.findIndex((v) => v >= total / 2)]!;

  const steps = {
    type: 'waterfall',
    name: 'Rain',
    x: [...NORMALS.map((n) => n.name), 'Year'],
    y: [...NORMALS.map((n) => n.rain), null],
    measure: [...NORMALS.map(() => 'relative'), 'total'],
    text: [...NORMALS.map((n) => `+${n.rain.toFixed(1)}`), `${total.toFixed(1)} in`],
    textinfo: 'text',
    textposition: 'outside',
    textfont: { size: 10, color: LOOK.title },
    customdata: [
      ...NORMALS.map((n, k) => [
        `${monthName(n.month)}: <b>${n.rain.toFixed(2)} in</b>`,
        `${running[k]!.toFixed(1)} in since January 1`,
      ]),
      ['A normal year', `<b>${total.toFixed(1)} in</b> of rain`],
    ],
    hovertemplate: '%{customdata[0]}<br>%{customdata[1]}<extra></extra>',
    increasing: { marker: { color: RAIN } },
    totals: { marker: { color: RAIN_LIGHT } },
    connector: { line: { color: LOOK.zero, width: 1 } },
  } satisfies WaterfallTrace;

  const figure: FigureInput = {
    data: [steps],
    layout: {
      title: {
        text: narrow
          ? ''
          : `A normal year adds up to ${total.toFixed(1)} inches of rain; ${monthName(top[0]!.month)} and ${monthName(top[1]!.month)} add the most`,
      },
      showlegend: false,
      waterfallgap: 0.25,
      xaxis: { type: 'category', showgrid: false },
      yaxis: {
        title: { text: `Rain since January 1, inches (${NORMAL_FROM}–${NORMAL_TO} average)` },
        range: [0, Math.ceil(total / 5) * 5 + 4],
        dtick: 5,
      },
      annotations: [
        {
          xref: 'paper',
          yref: 'paper',
          x: 0.01,
          y: 0.97,
          xanchor: 'left',
          yanchor: 'top',
          align: 'left',
          showarrow: false,
          text: `Half of the year's rain has fallen by the end of ${monthName(half.month)}`,
          font: { size: 11, color: LOOK.text },
        },
      ],
    },
    config: chartConfig(narrow),
  };
  const chart: Chart = createChart(chartEl, figure);

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
