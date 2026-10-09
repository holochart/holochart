import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The `hive` arrangement (backlog G8): a hive plot. Nodes sit on a few axes around a center,
 * one per group, and along each axis in order of their number of links, the least linked nearest
 * the center. Nothing is optimized, so two graphs drawn this way can be compared. Links run
 * between the axes; a link between two nodes of one axis is not drawn. Here: who talks to whom
 * between the clients, the services and the stores of a system.
 */
export const meta: ExampleMeta = {
  title: 'Graph: hive plot',
  description: 'Three groups of nodes on three axes, ordered by degree, links between the axes.',
  tags: ['graph', 'network', 'hive', 'arrangement', 'groups'],
  size: { width: 640, height: 600 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(21);
  const tiers: readonly (readonly [string, number])[] = [
    ['Clients', 16],
    ['Services', 22],
    ['Stores', 12],
  ];
  const label: string[] = [];
  const group: string[] = [];
  const first: number[] = [];
  for (const [name, count] of tiers) {
    first.push(label.length);
    for (let i = 0; i < count; i++) {
      label.push(`${name.slice(0, -1)} ${i + 1}`);
      group.push(name);
    }
  }
  const source: number[] = [];
  const target: number[] = [];
  // A few popular nodes on each axis: the square of a uniform draw favours the low indices.
  const pick = (tier: number): number => first[tier]! + Math.floor(random() ** 2 * tiers[tier]![1]);
  for (let k = 0; k < 46; k++) {
    source.push(pick(0));
    target.push(pick(1));
  }
  for (let k = 0; k < 40; k++) {
    source.push(pick(1));
    target.push(pick(2));
  }
  for (let k = 0; k < 6; k++) {
    source.push(pick(0));
    target.push(pick(2));
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        arrangement: 'hive',
        hive: { innerradius: 30, outerradius: 230 },
        node: { label, group, size: 8, textposition: 'none' },
        link: { source, target, opacity: 0.7 },
      },
    ],
    layout: {
      title: { text: 'Calls between three tiers' },
      showlegend: false,
      margin: { l: 20, r: 20, t: 60, b: 20 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
