import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { ENERGY_LINKS, ENERGY_NODES } from '../_lib/energy.ts';

/**
 * Flow particles (plan E13.5c, a Holochart extension): `link.flow` streams dots along every link
 * from its source to its target, as many as the link is long and wide (`density`, particles per
 * 100 px for every 10 px of width), so the big flows read as busy and the trickles as sparse. The
 * particles take their link's color, opaque; `speed` (px per second), `size`, `color` and
 * `opacity` style them. They move on their own; this example sets `time` to freeze them 2 s into
 * the animation, so its image is always the same frame.
 */
export const meta: ExampleMeta = {
  title: 'Sankey: flow particles',
  description: 'The energy balance with particles streaming along the links, frozen at one frame.',
  tags: ['sankey', 'hierarchical', 'flow', 'domain', 'particles', 'animation'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'sankey',
        valuesuffix: ' TWh',
        node: { label: [...ENERGY_NODES] },
        link: {
          source: ENERGY_LINKS.map((l) => l[0]),
          target: ENERGY_LINKS.map((l) => l[1]),
          value: ENERGY_LINKS.map((l) => l[2]),
          flow: { time: 2 },
        },
      },
    ],
    layout: { title: { text: 'Energy balance, TWh per year' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
