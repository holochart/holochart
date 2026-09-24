import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Step lines (plan E9.2): values that hold until the next change, such as an interest rate, drawn
 * with `line.shape: 'hv'` on a date axis. The same data with `'vh'` and `'hvh'` shows where each
 * shape puts the step; markers mark the actual data points.
 */
export const meta: ExampleMeta = {
  title: 'Line: step shapes',
  description:
    "A policy rate as a step line (line.shape 'hv') on a date axis, compared with 'vh' and 'hvh' on the same data.",
  tags: ['line', 'scatter', 'step', 'date'],
  testTolerance: 0.004,
};

const DATES = [
  '2024-01-01',
  '2024-03-15',
  '2024-06-01',
  '2024-07-20',
  '2024-10-01',
  '2025-01-15',
  '2025-04-01',
  '2025-06-30',
];
const RATE = [4.5, 4.5, 4.25, 4.0, 3.75, 3.75, 3.5, 3.25];

export function run(el: HTMLElement): ExampleHandle {
  const shapes = [
    { shape: 'hv', name: "'hv': hold, then step" },
    { shape: 'vh', name: "'vh': step, then hold" },
    { shape: 'hvh', name: "'hvh': step halfway" },
  ];

  const chart = createChart(el, {
    data: shapes.map(({ shape, name }, k) => ({
      type: 'scatter',
      mode: 'lines+markers',
      name,
      x: DATES,
      // Offset each copy so the three shapes don't overlap.
      y: RATE.map((v) => v + k * 1.5),
      line: { shape, width: 2.5 },
      marker: { size: 7 },
    })),
    layout: {
      yaxis: { title: { text: 'Rate (%), offset per series' }, ticksuffix: '%' },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
