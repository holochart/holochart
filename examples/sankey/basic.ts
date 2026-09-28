import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { ENERGY_LINKS, ENERGY_NODES } from '../_lib/energy.ts';

/**
 * A basic sankey (plan E13.5a): a year of a (synthetic) national energy balance. Nodes are laid
 * out in columns by their depth in the flow (`node.align: 'justify'` puts the final uses in the
 * last column), sized by their throughput, and the links between them are as wide as their value.
 * Node colors come from the colorway; links are translucent. Hover a node or a link for its value
 * (with `valuesuffix`); drag a node to rearrange the diagram.
 */
export const meta: ExampleMeta = {
  title: 'Sankey: basic',
  description: 'Energy flows from primary sources through conversion to final uses and losses.',
  tags: ['sankey', 'hierarchical', 'flow', 'domain', 'basic'],
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
