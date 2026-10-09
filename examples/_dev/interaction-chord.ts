import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { InteractionHook } from './interaction-scatter.ts';

/**
 * Chord interaction playground (backlog G8): hovering a node arc shows its flows and highlights
 * its ribbons while the others dim, hovering a ribbon highlights it alone, and clicks emit
 * `click` with the node or link index. Chart events are logged to `window.__interaction.events`,
 * which tests/interaction/chord.spec.ts reads.
 *
 * The geometry is fixed so the tests can find arcs and ribbons without internals: 480×480 px with
 * 40 px margins, so the ring is centered on (240, 240). There are no labels and no gaps between
 * the arcs: the node ring spans radii 180–200 and the ribbons end at radius 178. Four directed
 * links, A → B (3), B → C (1), C → D (2) and D → A (2), make the arcs A 0°–112.5°, B 112.5°–202.5°,
 * C 202.5°–270° and D 270°–360°, clockwise from 12 o'clock. A → B leaves A between 45° and
 * 112.5° and enters B between 112.5° and 180°.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Chord: hover and click events',
  description:
    'Hovering and clicking chord arcs and ribbons, with the events logged to window.__interaction.',
  tags: ['dev', 'chord', 'interaction', 'no-visual-test'],
  size: { width: 480, height: 480 },
};

const EVENTS = ['hover', 'unhover', 'click'] as const;

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'chord',
        padangle: 0,
        textorientation: 'none',
        node: { label: ['A', 'B', 'C', 'D'], thickness: 20 },
        link: {
          source: [0, 1, 2, 3],
          target: [1, 2, 3, 0],
          value: [3, 1, 2, 2],
          label: ['a to b', 'b to c', 'c to d', 'd to a'],
        },
      },
    ],
    layout: { margin: { l: 40, r: 40, t: 40, b: 40 } },
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
