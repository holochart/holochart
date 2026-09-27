import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { InteractionHook } from '../_dev/interaction-scatter.ts';

/**
 * Indicator transitions for the interaction suite (tests/interaction/indicator.spec.ts): an
 * angular gauge with a number and delta, and a bullet gauge. The test calls `react` with a new
 * `value` and a `layout.transition`, reads the drawn number while it counts up, and checks that it
 * settles on the new value. Transition events are logged to `window.__interaction.events`.
 *
 * Not a visual test: its point is the transition.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: indicator count-up',
  description:
    'An angular and a bullet gauge whose values the interaction suite animates with react and layout.transition.',
  tags: ['indicator', 'financial', 'animation', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

const EVENTS = ['transitioning', 'transitioned', 'transitioninterrupted'] as const;

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'indicator',
        mode: 'gauge+number+delta',
        value: 100,
        delta: { reference: 100 },
        title: { text: 'Angular' },
        gauge: { axis: { range: [0, 1000] } },
        domain: { x: [0, 1], y: [0.4, 1] },
      },
      {
        type: 'indicator',
        mode: 'number+gauge',
        value: 100,
        title: { text: 'Bullet' },
        gauge: { shape: 'bullet', axis: { range: [0, 1000] } },
        domain: { x: [0.15, 1], y: [0.05, 0.25] },
      },
    ],
  });
  const hook: InteractionHook = { chart, events: [] };
  for (const name of EVENTS) chart.on(name, () => hook.events.push({ name, payload: null }));
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
