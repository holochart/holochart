import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { InteractionHook } from './interaction-scatter.ts';

/**
 * Accessible DOM mirror (plan E17.1): an interactive chart gets `role="figure"`, an `aria-label`
 * from its title plus an automatic summary, and a visually hidden description — chart types, axes
 * with their ranges, one summary per trace and hidden data tables. Open the browser's
 * accessibility inspector, or read `__interaction.chart.description` in the console; zoom to see
 * the axis ranges follow (debounced).
 *
 * Not a visual test: the description draws nothing, and the chart itself is a plain line + bar
 * chart covered elsewhere. The a11y interaction suite (tests/interaction/a11y.spec.ts) reads it.
 */
export const meta: ExampleMeta = {
  title: 'Accessibility: DOM mirror',
  description:
    'A line and a bar trace on a date axis with a title and axis titles, described to screen readers by the hidden DOM mirror.',
  tags: ['dev', 'chart', 'a11y', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

const MONTHS = ['2024-01-01', '2024-02-01', '2024-03-01', '2024-04-01', '2024-05-01', '2024-06-01'];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Revenue',
        x: MONTHS,
        y: [12, 15, 11, 18, 21, 19],
      },
      { type: 'bar', name: 'Costs', x: MONTHS, y: [8, 9, 10, 9, 12, 11] },
    ],
    layout: {
      title: { text: 'Revenue and costs, H1 2024' },
      xaxis: { title: { text: 'Month' } },
      yaxis: { title: { text: 'k$' } },
    },
  });
  const hook: InteractionHook = { chart, events: [] };
  window.__interaction = hook;
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => {
      if (window.__interaction === hook) delete window.__interaction;
      chart.destroy();
    },
  };
}
