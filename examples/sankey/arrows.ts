import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Arrowheads (plan E13.5a): `link.arrowlen` ends every link with an arrow into its target (at
 * most half the gap between the two columns), which makes the direction of a process explicit —
 * here the stages of a support ticket queue. Links take per-link colors, and `node.align: 'left'`
 * keeps each stage at its depth.
 */
export const meta: ExampleMeta = {
  title: 'Sankey: arrows',
  description: 'Support tickets moving through triage and resolution, with arrowheads on links.',
  tags: ['sankey', 'hierarchical', 'flow', 'domain', 'arrows'],
  testTolerance: 0.004,
};

const LABELS = ['New', 'Triage', 'Self-service', 'Level 1', 'Level 2', 'Solved', 'Escalated'];
const LINKS: [number, number, number][] = [
  [0, 1, 420],
  [0, 2, 180],
  [1, 3, 300],
  [1, 4, 120],
  [2, 5, 150],
  [2, 3, 30],
  [3, 5, 250],
  [3, 4, 80],
  [4, 5, 150],
  [4, 6, 50],
];
const GOOD = 'rgba(17, 142, 54, 0.45)';
const PLAIN = 'rgba(164, 167, 181, 0.3)';
const BAD = 'rgba(234, 42, 55, 0.45)';

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'sankey',
        node: { label: LABELS, align: 'left', pad: 16 },
        link: {
          arrowlen: 14,
          source: LINKS.map((l) => l[0]),
          target: LINKS.map((l) => l[1]),
          value: LINKS.map((l) => l[2]),
          color: LINKS.map((l) => (l[1] === 5 ? GOOD : l[1] === 6 ? BAD : PLAIN)),
        },
      },
    ],
    layout: { title: { text: 'Support tickets this week' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
