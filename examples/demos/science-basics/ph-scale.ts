import { createChart, type BarTrace, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The pH of everyday things as a horizontal `bar` chart, sorted from the strongest acid to the
 * strongest base. Each bar is colored by its pH on a red, green, purple scale like universal
 * indicator paper (`marker.color` with a custom `marker.colorscale`, `cmin: 0`, `cmax: 14`, and
 * its colorbar as the key), with the value written at its end (`text`, `textposition: 'outside'`).
 * A dotted line (`layout.shapes`) marks pH 7, neutral.
 *
 * pH counts hydrogen ions on a tenfold scale: each step down is ten times more acidic, so lemon
 * juice (pH 2) is 100,000 times more acidic than pure water (pH 7).
 */
export const meta: ExampleMeta = {
  title: 'pH: acids and bases around the house',
  description:
    'Horizontal bars of the pH of fifteen everyday liquids, from battery acid to drain cleaner, colored like universal indicator.',
  tags: ['demo', 'bar', 'horizontal', 'colorscale', 'shapes', 'chemistry'],
  size: { width: 960, height: 520 },
  testTolerance: 0.004,
};

const ITEMS: readonly (readonly [string, number])[] = [
  ['Battery acid', 1],
  ['Lemon juice', 2],
  ['Cola', 2.5],
  ['Vinegar', 2.9],
  ['Orange juice', 3.5],
  ['Coffee', 5],
  ['Milk', 6.5],
  ['Pure water', 7],
  ['Blood', 7.4],
  ['Sea water', 8.1],
  ['Baking soda solution', 8.3],
  ['Soap', 10],
  ['Ammonia cleaner', 11.5],
  ['Bleach', 12.5],
  ['Drain cleaner', 14],
];

/** Universal-indicator-like colors over pH 0–14. */
const INDICATOR: [number, string][] = [
  [0, '#d7191c'],
  [3 / 14, '#f07c1e'],
  [5 / 14, '#e3c221'],
  [7 / 14, '#2e9e41'],
  [9 / 14, '#1f8fa8'],
  [11 / 14, '#3f5fc4'],
  [1, '#7a3fb0'],
];

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const sorted = [...ITEMS].sort((a, b) => a[1] - b[1]);

  const trace: BarTrace = {
    type: 'bar',
    orientation: 'h',
    name: 'pH',
    y: sorted.map(([name]) => name),
    x: sorted.map(([, ph]) => ph),
    text: sorted.map(([, ph]) => String(ph)),
    textposition: 'outside',
    textfont: { color: LOOK.text, size: 11 },
    cliponaxis: false,
    marker: {
      color: sorted.map(([, ph]) => ph),
      colorscale: INDICATOR,
      cmin: 0,
      cmax: 14,
      showscale: !narrow,
      colorbar: {
        title: { text: 'acidic ← pH → basic', side: 'right' },
        tickvals: [0, 7, 14],
        thickness: 12,
        len: 0.8,
      },
    },
    hovertemplate: '<b>%{y}</b><br>pH %{x}<extra></extra>',
  };

  const chart: Chart = createChart(chartEl, {
    data: [trace],
    layout: {
      title: { text: narrow ? '' : 'The pH scale: from battery acid to drain cleaner' },
      showlegend: false,
      bargap: 0.25,
      margin: narrow ? { l: 118, r: 24, t: 28, b: 44 } : { l: 150, t: 56 },
      xaxis: {
        title: { text: 'pH (below 7 acidic, above 7 basic)' },
        range: [0, 14.9],
        tickvals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
        zeroline: false,
      },
      // The strongest acid at the top.
      yaxis: { type: 'category', autorange: 'reversed', tickfont: { size: narrow ? 9 : 11 } },
      shapes: [
        {
          type: 'line',
          xref: 'x',
          x0: 7,
          x1: 7,
          yref: 'paper',
          y0: 0,
          y1: 1,
          line: { color: LOOK.title, width: 1, dash: 'dot' },
        },
      ],
      annotations: [
        {
          xref: 'x',
          x: 7,
          yref: 'paper',
          y: 1,
          yanchor: 'bottom',
          text: 'neutral, pH 7',
          showarrow: false,
          font: { size: 10, color: LOOK.title },
        },
        {
          xref: 'x',
          x: 14.8,
          xanchor: 'right',
          yref: 'y',
          y: 'Lemon juice',
          text: 'Each step is a factor of 10:<br>lemon juice is 100,000 times<br>more acidic than pure water',
          align: 'right',
          showarrow: false,
          font: { size: 10, color: LOOK.text },
        },
      ],
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
