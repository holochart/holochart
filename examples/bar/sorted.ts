import { createChart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Bars sorted by value (plan E3.6): the data stays in any order and `categoryorder` sorts the
 * category axis by an aggregate of the bar values, as in Plotly. Left, grouped bars with
 * `'total descending'`: each category's total over all three traces ranks it. Right, a horizontal
 * ranked chart with `'total ascending'` on its y axis: category axes run bottom-up, so ascending
 * puts the largest bar on top.
 */
export const meta: ExampleMeta = {
  title: 'Bar: sorted by value',
  description:
    "Grouped bars ordered by per-category total (categoryorder 'total descending') and a horizontal ranking ('total ascending').",
  tags: ['bar', 'chart', 'categoryorder', 'group', 'horizontal'],
  size: { width: 760, height: 400 },
};

export function run(el: HTMLElement): ExampleHandle {
  // Vendored Inter for axis labels: offline and deterministic (troika's default is a CDN font).
  useExampleFonts();
  const fruits = ['Kiwi', 'Apple', 'Mango', 'Pear', 'Plum'];
  const regions = ['Canada', 'Brazil', 'India', 'Japan', 'Kenya', 'Spain'];
  const chart = createChart(el, {
    data: [
      { type: 'bar', name: '2023', x: fruits, y: [4, 12, 7, 5, 2] },
      { type: 'bar', name: '2024', x: fruits, y: [5, 10, 9, 4, 3] },
      { type: 'bar', name: '2025', x: fruits, y: [7, 11, 12, 3, 2] },
      {
        type: 'bar',
        orientation: 'h',
        y: regions,
        x: [18, 42, 67, 25, 9, 33],
        xaxis: 'x2',
        yaxis: 'y2',
        text: ['18', '42', '67', '25', '9', '33'],
        textposition: 'outside',
        marker: { color: '#00a88f' },
        showlegend: false,
      },
    ],
    layout: {
      font: { family: 'Inter' },
      margin: { l: 48, r: 24, t: 24, b: 40 },
      paper_bgcolor: '#ffffff',
      plot_bgcolor: '#e5ecf6',
      legend: { x: 0.54, y: 0.98, xanchor: 'right', yanchor: 'top' },
      xaxis: { domain: [0, 0.55], categoryorder: 'total descending' },
      yaxis: { domain: [0, 1] },
      xaxis2: { domain: [0.7, 1], anchor: 'y2', range: [0, 80] },
      yaxis2: { anchor: 'x2', categoryorder: 'total ascending' },
      bargap: 0.25,
    },
    config: { responsive: true },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
