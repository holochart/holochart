import { componentsReady, createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Indicator, angular gauge (plan E12.7): the value on a half ring from 0 to 500 (`[null, 500]`
 * keeps the default start), with colored `steps` under the value bar, a `threshold` line and a
 * ticked axis around the ring. The number and its delta sit in the ring's hole, on its baseline.
 * The whole gauge is one instanced GPU arc set.
 */
export const meta: ExampleMeta = {
  title: 'Indicator: angular gauge',
  description:
    'A half-ring gauge with colored steps, a threshold line and a ticked axis, the number and its delta in the middle.',
  tags: ['indicator', 'financial', 'kpi', 'gauge', 'angular'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'indicator',
        mode: 'gauge+number+delta',
        value: 318,
        delta: { reference: 280 },
        title: { text: 'Throughput (req/s)' },
        gauge: {
          axis: { range: [null, 500] },
          steps: [
            { range: [0, 250], color: 'rgba(17, 142, 54, 0.25)' },
            { range: [250, 400], color: 'rgba(153, 118, 0, 0.3)' },
            { range: [400, 500], color: 'rgba(234, 42, 55, 0.3)' },
          ],
          threshold: { value: 450, thickness: 0.75, line: { color: '#ea2a37', width: 3 } },
        },
      },
    ],
    // Room for the tick labels at both ends of the ring, which reach past the domain (Plotly).
    layout: { margin: { l: 40, r: 40 } },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
