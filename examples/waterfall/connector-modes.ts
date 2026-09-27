import { componentsReady, createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Connector modes (plan E12.4): the same waterfall twice. Left, `connector.mode: 'between'` (the
 * default) draws a line from each bar's end to the next bar. Right, `'spanning'` also crosses each
 * bar at its ends, so one line runs through the whole waterfall; here dashed and thicker, in
 * `connector.line`. Two subplots from `layout.grid`.
 */
export const meta: ExampleMeta = {
  title: 'Waterfall: connector modes',
  description:
    "Connector lines 'between' bars next to 'spanning' connectors with a dashed, thicker line style, on two subplots.",
  tags: ['waterfall', 'financial', 'chart', 'connector', 'subplots', 'style'],
  size: { width: 760, height: 380 },
  testTolerance: 0.004,
};

const STEPS = ['Start', 'A', 'B', 'C', 'D', 'End'];
const VALUES = [10, 4, -6, 3, -2, null];
const MEASURE = ['absolute', 'relative', 'relative', 'relative', 'relative', 'total'];

export function run(el: HTMLElement): ExampleHandle {
  const chart: Chart = createChart(el, {
    data: [
      { type: 'waterfall', name: 'between', x: STEPS, y: VALUES, measure: MEASURE },
      {
        type: 'waterfall',
        name: 'spanning',
        x: STEPS,
        y: VALUES,
        measure: MEASURE,
        xaxis: 'x2',
        yaxis: 'y2',
        connector: { mode: 'spanning', line: { color: '#a4a7b5', width: 2, dash: 'dot' } },
      },
    ],
    layout: {
      grid: { rows: 1, columns: 2, pattern: 'independent' },
      showlegend: false,
      annotations: [
        {
          text: "mode: 'between'",
          xref: 'x domain',
          yref: 'y domain',
          x: 0,
          y: 1.02,
          xanchor: 'left',
          yanchor: 'bottom',
          showarrow: false,
        },
        {
          text: "mode: 'spanning', dotted",
          xref: 'x2 domain',
          yref: 'y2 domain',
          x: 0,
          y: 1.02,
          xanchor: 'left',
          yanchor: 'bottom',
          showarrow: false,
        },
      ],
      margin: { t: 32 },
    },
    config: { responsive: true },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
