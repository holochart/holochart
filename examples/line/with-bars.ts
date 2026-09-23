import { createChart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A line and bars on shared axes: the figure built step by step in "Your first chart"
 * (apps/docs/getting-started/first-chart.md). Keep the two in sync.
 */
export const meta: ExampleMeta = {
  title: 'Line: with bars (first chart)',
  description:
    'A lines+markers trace and a bar trace on the same axes, with a title and axis titles.',
  tags: ['line', 'scatter', 'bar', 'tutorial'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  useExampleFonts();
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        x: [1, 2, 3, 4, 5],
        y: [3, 1, 4, 2, 5],
        mode: 'lines+markers',
        name: 'Visits',
      },
      { type: 'bar', x: [1, 2, 3, 4, 5], y: [2, 2, 3, 1, 4], name: 'Signups' },
    ],
    layout: {
      font: { family: 'Inter' },
      title: { text: 'Weekly traffic' },
      xaxis: { title: { text: 'Week' } },
      yaxis: { title: { text: 'Count' } },
    },
    config: { responsive: true },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
