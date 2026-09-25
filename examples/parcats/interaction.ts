import { createChart } from '@mk7s/holochart';
import type { InteractionHook } from '../_dev/interaction-scatter.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Parallel-categories interaction playground (plan E10.11, E20.4): dragging a category band
 * reorders the categories (a `restyle` of `categoryarray`, `ticktext` and `categoryorder`),
 * dragging a dimension label reorders the dimensions (a `restyle` of `displayindex`), and hovering
 * a band or a path shows its count. Chart events are logged to `window.__interaction.events`, which
 * tests/interaction/parcats.spec.ts reads.
 *
 * The geometry is fixed so the tests can find the bands without internals: 640×400 px, margins
 * 60 / 60 / 60 / 40 (l / r / t / b), so the domain is x 60–580, y 60–360. The three dimensions
 * (16 px wide bands, 40 px label pad) are at x = 100, 312 and 524; A has categories a1, a2 (6 and 6
 * samples), B has b1, b2, b3 (4 each), C has c1, c2 (8 and 4). With 3 categories at most, the band
 * heights share 300 − 2 × 8 = 284 px: B's bands are y 60–154.7, 162.7–257.3, 265.3–360.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Parallel categories: drag and hover events',
  description:
    'Dragging bands and dimension labels, with the restyle events logged to window.__interaction.',
  tags: ['parcats', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

const EVENTS = ['restyle', 'relayout', 'hover', 'click'] as const;

export function run(el: HTMLElement): ExampleHandle {
  const a = ['a1', 'a1', 'a1', 'a1', 'a1', 'a1', 'a2', 'a2', 'a2', 'a2', 'a2', 'a2'];
  const b = ['b1', 'b2', 'b3', 'b1', 'b2', 'b3', 'b1', 'b2', 'b3', 'b1', 'b2', 'b3'];
  const c = ['c1', 'c1', 'c1', 'c1', 'c2', 'c2', 'c1', 'c1', 'c1', 'c1', 'c2', 'c2'];
  const chart = createChart(el, {
    data: [
      {
        type: 'parcats',
        line: { color: '#5e74d5' },
        dimensions: [
          { label: 'A', values: a },
          { label: 'B', values: b },
          { label: 'C', values: c },
        ],
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
