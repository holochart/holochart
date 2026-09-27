import { componentsReady, createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Indicator, number and delta (plan E12.7): two KPIs side by side, each in its own `domain`. The
 * left one shows its change from `delta.reference` as a relative delta (a `▼` in the falling
 * color), below the number; the right one an absolute delta to the right of the number, with a
 * suffix. Number and delta are scaled together to fit the domain.
 */
export const meta: ExampleMeta = {
  title: 'Indicator: number and delta',
  description:
    'Two KPIs with their change from a reference: a relative delta below the number, and an absolute one to its right.',
  tags: ['indicator', 'financial', 'kpi', 'number', 'delta'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'indicator',
        mode: 'number+delta',
        value: 492,
        number: { suffix: ' orders' },
        delta: { reference: 512, relative: true, valueformat: '.1%' },
        title: { text: 'Orders today<br><span style="font-size:0.7em">vs. yesterday</span>' },
        domain: { x: [0, 0.48], y: [0, 1] },
      },
      {
        type: 'indicator',
        mode: 'number+delta',
        value: 11.3,
        number: { valueformat: '.1f', suffix: ' ms' },
        delta: { reference: 9.8, position: 'right', valueformat: '.1f', suffix: ' ms' },
        title: { text: 'p95 latency' },
        domain: { x: [0.52, 1], y: [0, 1] },
      },
    ],
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
