import { componentsReady, createChart, type IndicatorTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Indicator, bullet gauges (plan E12.7): three horizontal gauges stacked by `domain`, each with
 * qualitative `steps`, a `threshold` target line, the value bar (a quarter of the gauge's height
 * by default), an axis along its bottom edge, the title to its left and the number (with a delta)
 * in the right quarter of its domain. Each gauge is one instanced GPU rect set.
 */
export const meta: ExampleMeta = {
  title: 'Indicator: bullet gauges',
  description:
    'Three stacked bullet gauges with qualitative steps, a target threshold, the value bar and the number with its delta.',
  tags: ['indicator', 'financial', 'kpi', 'gauge', 'bullet'],
  testTolerance: 0.004,
};

const STEPS = ['rgba(94, 116, 213, 0.12)', 'rgba(94, 116, 213, 0.24)'];

function bullet(
  title: string,
  value: number,
  reference: number,
  target: number,
  max: number,
  y: [number, number],
): IndicatorTrace {
  return {
    type: 'indicator',
    mode: 'number+gauge+delta',
    value,
    delta: { reference },
    title: { text: title },
    domain: { x: [0.2, 1], y },
    gauge: {
      shape: 'bullet',
      axis: { range: [0, max] },
      steps: [
        { range: [0, 0.6 * max], color: STEPS[0] },
        { range: [0.6 * max, 0.85 * max], color: STEPS[1] },
      ],
      threshold: { value: target, thickness: 0.75, line: { width: 2 } },
    },
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      bullet('Revenue', 220, 200, 250, 300, [0.72, 0.92]),
      bullet('Profit', 36, 42, 45, 60, [0.4, 0.6]),
      bullet('Satisfaction', 4.3, 4.1, 4.5, 5, [0.08, 0.28]),
    ],
    layout: { margin: { l: 16, r: 16, t: 16, b: 32 } },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
