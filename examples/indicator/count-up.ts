import { createChart, type FigureInput } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Indicator transition (plan E12.7, E7.3): `react` with a `layout.transition` to a new `value`
 * counts the number up, formatted every frame, moves the delta and sweeps the gauge bar, like
 * Plotly's d3 transitions. `value` is animatable: the animation engine writes the in-between
 * value on every frame. With `prefers-reduced-motion: reduce` the change snaps.
 *
 * The example plays one transition, from 120 to 385, and is shown (and tested) once it has settled.
 */
export const meta: ExampleMeta = {
  title: 'Indicator: count-up transition',
  description:
    'React with layout.transition to a new value: the number counts up, the delta follows and the gauge bar sweeps to the new value.',
  tags: ['indicator', 'financial', 'gauge', 'animation', 'transitions'],
  testTolerance: 0.004,
};

function figure(value: number): FigureInput {
  return {
    data: [
      {
        type: 'indicator',
        mode: 'gauge+number+delta',
        value,
        delta: { reference: 300 },
        title: { text: 'Visitors per minute' },
        gauge: { axis: { range: [0, 500] }, threshold: { value: 400 } },
      },
    ],
    layout: { transition: { duration: 900, easing: 'cubic-in-out' }, margin: { l: 40, r: 40 } },
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, figure(120));
  // One transition; `react` resolves once it has finished.
  const ready = chart.ready.then(() => chart.react(figure(385)));
  return {
    ready: ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
