import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { InteractionHook } from './interaction-scatter.ts';

/**
 * Live sankey flow particles (plan E13.5c): `link.flow` without `time`, so the particles stream
 * along the links, the loop (C → B, a cycle) included, for as long as the chart is on screen.
 * Hover a node to dim the particles of the other links; drag a node and they follow its links.
 * With `prefers-reduced-motion: reduce` they hold still. `window.__interaction` exposes the chart
 * for tests/interaction/sankey-flow.spec.ts.
 *
 * Not a visual test: it animates (`examples/sankey/flow.ts` is the frozen frame).
 */
export const meta: ExampleMeta = {
  title: 'Sankey: live flow particles',
  description: 'Particles streaming along sankey links and a loop, animated live.',
  tags: ['dev', 'sankey', 'particles', 'animation', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'sankey',
        node: { label: ['A', 'B', 'C', 'D'], pad: 30 },
        link: {
          source: [0, 1, 1, 2],
          target: [1, 2, 3, 1],
          value: [8, 7, 4, 3],
          color: [
            'rgba(31, 119, 180, 0.35)',
            'rgba(44, 160, 44, 0.35)',
            'rgba(148, 103, 189, 0.35)',
            'rgba(255, 127, 14, 0.35)',
          ],
          flow: { speed: 80, size: 4 },
        },
      },
    ],
    layout: { margin: { l: 60, r: 60, t: 60, b: 60 } },
    config: { displayModeBar: false },
  });
  const hook: InteractionHook = { chart, events: [] };
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
