import { createChart } from '@mk7s/holochart';
import type { InteractionHook } from '../_dev/interaction-scatter.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Parallel-coordinates interaction playground (plan E10.10, E20.4): brushing an axis emits
 * `restyle` with `dimensions[i].constraintrange`, a click on an axis clears it, and dragging an axis
 * label reorders the dimensions (a `restyle` of `dimensions`). Chart events are logged to
 * `window.__interaction.events`, which tests/interaction/parcoords.spec.ts reads.
 *
 * The geometry is fixed so the tests can find the axes without internals: 640×400 px, margins
 * 60 / 60 / 80 / 40 (l / r / t / b), so the domain is x 60–580, y 80–360 and the three axes are at
 * x = 60, 320 and 580; values run 0–100 from y = 358 (bottom) to y = 82 (top). Axis labels are 28 px
 * above the domain (y ≈ 52 baseline).
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Parallel coordinates: brush and reorder events',
  description:
    'Brushing axes and dragging axis labels, with the restyle events logged to window.__interaction.',
  tags: ['parcoords', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

const EVENTS = ['restyle', 'relayout', 'click'] as const;

export function run(el: HTMLElement): ExampleHandle {
  const n = 50;
  const a = Array.from({ length: n }, (_, i) => (i * 100) / (n - 1));
  const b = a.map((v) => 100 - v);
  const c = a.map((v, i) => (i % 2 ? v : 100 - v));
  const chart = createChart(el, {
    data: [
      {
        type: 'parcoords',
        line: { color: '#5e74d5' },
        dimensions: [
          { label: 'Alpha', values: a, range: [0, 100] },
          { label: 'Beta', values: b, range: [0, 100], multiselect: false },
          { label: 'Gamma', values: c, range: [0, 100] },
        ],
      },
    ],
    layout: { margin: { l: 60, r: 60, t: 80, b: 40 } },
    config: { displayModeBar: false },
  });
  const hook: InteractionHook = { chart, events: [] };
  for (const name of EVENTS) {
    chart.on(name, (payload: unknown) => {
      hook.events.push({ name, payload: JSON.parse(JSON.stringify(payload ?? null)) as unknown });
    });
  }
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
