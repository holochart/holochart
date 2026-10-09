import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { ENERGY_LINKS, ENERGY_NODES } from '../_lib/energy.ts';

/**
 * A chord diagram from `node` / `link` (backlog G8): the energy balance of the sankey examples,
 * as it is. `link.source` and `link.target` are node indices and `link.value` the flow, so the
 * same three arrays feed a `sankey`, a `graph` and a `chord` trace. Each arc is as wide as what
 * its node gives plus what it takes, which makes the grid and the plants the widest. The labels
 * are too long to fit along their arcs, so they are radial, and turned around on the left half.
 */
export const meta: ExampleMeta = {
  title: 'Chord: nodes and links',
  description: 'The sankey energy balance as a chord diagram, from the same node and link arrays.',
  tags: ['chord', 'network', 'links', 'labels', 'domain'],
  size: { width: 640, height: 600 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'chord',
        valuesuffix: ' TWh',
        node: { label: [...ENERGY_NODES] },
        link: {
          source: ENERGY_LINKS.map((l) => l[0]),
          target: ENERGY_LINKS.map((l) => l[1]),
          value: ENERGY_LINKS.map((l) => l[2]),
        },
      },
    ],
    layout: {
      title: { text: 'Energy flows' },
      margin: { l: 20, r: 20, t: 60, b: 20 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
