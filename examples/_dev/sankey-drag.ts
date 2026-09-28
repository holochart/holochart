import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { InteractionHook } from './interaction-scatter.ts';

/**
 * Sankey interaction playground (plan E13.5b, E20.4): hovering a node highlights its links and
 * shows its flow counts, hovering a link shows its source and target, clicking emits `click`, and
 * dragging a node rearranges the diagram (by `arrangement`: `snap` by default — change it with
 * `__interaction.chart.restyle({ arrangement: 'perpendicular' })`) and restyles `node.x` /
 * `node.y`. Chart events are logged to `window.__interaction.events`, which
 * tests/interaction/sankey.spec.ts reads.
 *
 * The geometry is fixed so the tests can find nodes without internals: 640×400 px, margins
 * 60 / 60 / 60 / 40 (l / r / t / b), so the domain is x 60–580, y 60–360. Three columns of 20 px
 * nodes at x = 60, 310 and 560. A → C (6) and B → C (4), C → D (7) and C → E (3); with 20 px
 * padding the scale is 28 px per unit, so A spans y 60–228, B 248–360, D 60–256 and E 276–360,
 * and C (280 px) sits between y 60 and 360.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Sankey: hover, click and drag events',
  description:
    'Hovering, clicking and dragging sankey nodes and links, with the events logged to window.__interaction.',
  tags: ['dev', 'sankey', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

const EVENTS = ['hover', 'unhover', 'click', 'restyle'] as const;

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'sankey',
        node: { label: ['A', 'B', 'C', 'D', 'E'] },
        link: {
          source: [0, 1, 2, 2],
          target: [2, 2, 3, 4],
          value: [6, 4, 7, 3],
          label: ['a to c', 'b to c', 'c to d', 'c to e'],
        },
      },
    ],
    layout: { margin: { l: 60, r: 60, t: 60, b: 40 } },
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
