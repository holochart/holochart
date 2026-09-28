import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Style rules over colorscaled colors (plan E8.5, E9.1). A rule that sets a CSS color on a trace
 * whose `marker.color` is numeric merges that color into the numbers, and those points are drawn
 * in it while the others keep the colorscale (as Plotly draws CSS colors in a colorscaled array):
 * - left, 200 readings colored by value through Viridis, the ones above 1.35 set to red and larger;
 * - right, monthly totals through Blues, the months over the 80 target set to amber.
 */
export const meta: ExampleMeta = {
  title: 'Scatter: style rules over a colorscale',
  description:
    'styleRules set CSS colors on colorscaled markers and bars: matching points draw in the rule color, the rest keep Viridis / Blues.',
  tags: ['scatter', 'bar', 'markers', 'colorscale', 'style-rules', 'conditional-styling'],
  testTolerance: 0.004,
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(11));
  const n = 200;
  const x = Float64Array.from({ length: n }, (_, i) => i);
  const y = Float64Array.from({ length: n }, (_, i) => Math.sin(i / 25) + normal() * 0.45);
  const totals = MONTHS.map((_, i) => Math.round(60 + 25 * Math.sin((i - 2) / 2) + normal() * 6));

  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        name: 'readings',
        x,
        y,
        marker: { size: 6, color: Float64Array.from(y), colorscale: 'Viridis' },
        styleRules: [
          { when: { y: { gt: 1.35 } }, set: { 'marker.color': '#ef4444', 'marker.size': 10 } },
        ],
      },
      {
        type: 'bar',
        name: 'monthly totals',
        x: MONTHS,
        y: totals,
        xaxis: 'x2',
        yaxis: 'y2',
        marker: { color: totals.slice(), colorscale: 'Blues', cmin: 0, cmax: 100 },
        styleRules: [{ when: { y: { gt: 80 } }, set: { 'marker.color': '#f59e0b' } }],
      },
    ],
    layout: {
      title: { text: 'Rule colors over colorscales' },
      xaxis: { domain: [0, 0.46], title: { text: 'Reading' } },
      yaxis: { title: { text: 'Value' } },
      xaxis2: { domain: [0.56, 1], anchor: 'y2' },
      yaxis2: { anchor: 'x2', range: [0, 100], title: { text: 'Total' } },
      showlegend: false,
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
