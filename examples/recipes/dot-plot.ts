import { createChart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Cleveland dot plot (plan E9.6 recipe): one `scatter` trace per group in `mode: 'markers'`, with
 * categories on the y axis. Dots compare values by position alone, which reads more accurately
 * than bar length when the values don't start at zero.
 */
export const meta: ExampleMeta = {
  title: 'Recipe: dot plot',
  description:
    'A Cleveland dot plot: two marker traces over categories on the y axis, comparing two years.',
  tags: ['recipe', 'scatter', 'dot', 'category'],
  testTolerance: 0.004,
};

const CITIES = ['Lisbon', 'Oslo', 'Vienna', 'Dublin', 'Madrid', 'Berlin', 'Paris', 'London'];
const Y2015 = [31, 28, 33, 36, 38, 40, 44, 47];
const Y2025 = [29, 30, 30, 39, 35, 42, 41, 52];

export function run(el: HTMLElement): ExampleHandle {
  useExampleFonts();
  const chart = createChart(el, {
    data: [
      { name: '2015', x: Y2015, marker: { color: '#9ecae1' } },
      { name: '2025', x: Y2025, marker: { color: '#08519c' } },
    ].map((t) => ({
      type: 'scatter',
      mode: 'markers',
      y: CITIES,
      ...t,
      marker: { ...t.marker, size: 12, line: { width: 1, color: '#ffffff' } },
    })),
    layout: {
      font: { family: 'Inter', size: 12 },
      title: { text: 'Average commute (minutes)', xref: 'paper', x: 0, xanchor: 'left' },
      legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.1 },
      xaxis: { range: [24, 56], zeroline: false },
      margin: { l: 72, r: 24, t: 56, b: 40 },
      plot_bgcolor: '#e5ecf6',
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
