import { createChart } from '@mk7s/holochart';
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

  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        x: connectorX,
        y: connectorY,
        line: { color: '#3e3e4c', width: 3 },
        showlegend: false,
        hoverinfo: 'skip',
      },
      {
        type: 'scatter',
        mode: 'markers',
        name: '2015',
        x: Y2015,
        y: CITIES,
        marker: { size: 10, color: '#80838f' },
      },
      {
        type: 'scatter',
        mode: 'markers',
        name: '2025',
        x: Y2025,
        y: CITIES,
        marker: { size: 10, color: '#5e74d5' },
      },
    ],
    layout: {
      title: { text: 'Average commute (minutes), 2015 → 2025' },
      xaxis: { range: [24, 56], zeroline: false },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
