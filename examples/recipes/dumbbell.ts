import { createChart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Dumbbell chart (plan E9.6 recipe): the dot plot with a bar joining each pair. All connectors
 * are one `scatter` trace in `mode: 'lines'`: each pair contributes `[start, end, null]`, and the
 * `null` breaks the line between categories. Two marker traces draw the ends on top.
 */
export const meta: ExampleMeta = {
  title: 'Recipe: dumbbell',
  description:
    'Before/after pairs joined by connectors: one lines trace broken by nulls, plus two marker traces.',
  tags: ['recipe', 'scatter', 'dumbbell', 'category'],
  testTolerance: 0.004,
};

const CITIES = ['Lisbon', 'Oslo', 'Vienna', 'Dublin', 'Madrid', 'Berlin', 'Paris', 'London'];
const Y2015 = [31, 28, 33, 36, 38, 40, 44, 47];
const Y2025 = [29, 30, 30, 39, 35, 42, 41, 52];

export function run(el: HTMLElement): ExampleHandle {
  // [start, end, null] per category: one trace, one draw call, no line between categories.
  const connectorX = CITIES.flatMap((_, i) => [Y2015[i]!, Y2025[i]!, null]);
  const connectorY = CITIES.flatMap((c) => [c, c, null]);

  useExampleFonts();
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        x: connectorX,
        y: connectorY,
        line: { color: '#a0a8b8', width: 4 },
        showlegend: false,
        hoverinfo: 'skip',
      },
      {
        type: 'scatter',
        mode: 'markers',
        name: '2015',
        x: Y2015,
        y: CITIES,
        marker: { size: 12, color: '#9ecae1' },
      },
      {
        type: 'scatter',
        mode: 'markers',
        name: '2025',
        x: Y2025,
        y: CITIES,
        marker: { size: 12, color: '#08519c' },
      },
    ],
    layout: {
      font: { family: 'Inter', size: 12 },
      title: {
        text: 'Average commute (minutes), 2015 → 2025',
        xref: 'paper',
        x: 0,
        xanchor: 'left',
      },
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
