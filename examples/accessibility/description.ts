import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The accessible description every chart gets: the chart element has `role="figure"` and an
 * `aria-label` made of its title and a summary ("Line and bar chart with 2 traces."), and holds a
 * visually hidden description with the chart types, the axes and their ranges, one summary per
 * trace and a data table per trace. Nothing extra is drawn. Open the browser's accessibility
 * inspector on the chart, or read `chart.description` from code; zoom, and the axis ranges in the
 * description follow.
 */
export const meta: ExampleMeta = {
  title: 'Accessibility: hidden description',
  description:
    'A line and a bar trace on a date axis with a title and axis titles, described to screen readers by the hidden description.',
  tags: ['a11y', 'screen reader', 'line', 'bar'],
  size: { width: 640, height: 400 },
  testTolerance: 0.004,
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
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
