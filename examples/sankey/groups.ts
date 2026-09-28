import { createChart } from '@mk7s/holochart';
import { ENERGY_LINKS, ENERGY_NODES } from '../_lib/energy.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Node groups (plan E13.5a): `node.groups` merges nodes into one combined node. Here wind, solar
 * and hydro become one "Renewables" node — links from its members attach to it, and its label is
 * the one after the last node a link names (index 16), as in Plotly. The energy balance of the
 * basic example, otherwise unchanged.
 */
export const meta: ExampleMeta = {
  title: 'Sankey: node groups',
  description: 'The energy balance with wind, solar and hydro merged into one group node.',
  tags: ['sankey', 'hierarchical', 'flow', 'domain', 'groups'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'sankey',
        valuesuffix: ' TWh',
        node: { label: [...ENERGY_NODES, 'Renewables'], groups: [[4, 5, 6]] },
        link: {
          source: ENERGY_LINKS.map((l) => l[0]),
          target: ENERGY_LINKS.map((l) => l[1]),
          value: ENERGY_LINKS.map((l) => l[2]),
        },
      },
    ],
    layout: { title: { text: 'Energy balance with grouped renewables, TWh per year' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
