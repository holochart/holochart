import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Pinned nodes (backlog G2): under `force`, a node that has both `node.x` and `node.y` stays
 * there, and the others arrange themselves around it. Here the three hubs are pinned at the
 * corners of a triangle (in layout units: px at the size the graph is laid out for) and their
 * services settle between them, each nearest the hubs it talks to. The pinned nodes are drawn as
 * diamonds.
 */
export const meta: ExampleMeta = {
  title: 'Graph: force layout with pinned nodes',
  description: 'Three nodes held at given positions; the rest of the graph settles around them.',
  tags: ['graph', 'network', 'force', 'pinned', 'layout'],
  size: { width: 680, height: 500 },
  testTolerance: 0.004,
};

const HUBS = ['Gateway', 'Queue', 'Database'];
const PINS: readonly (readonly [number, number])[] = [
  [0, 150],
  [-190, -120],
  [190, -120],
];
/** Service name, then the hubs it uses. */
const SERVICES: readonly (readonly [string, readonly number[]])[] = [
  ['Web', [0]],
  ['Mobile API', [0]],
  ['Auth', [0, 2]],
  ['Search', [0, 2]],
  ['Orders', [0, 1, 2]],
  ['Billing', [1, 2]],
  ['Mailer', [1]],
  ['Reports', [2]],
  ['Thumbnails', [1]],
  ['Audit log', [1, 2]],
  ['Sessions', [0]],
  ['Inventory', [1, 2]],
];

export function run(el: HTMLElement): ExampleHandle {
  const label = [...HUBS, ...SERVICES.map((s) => s[0])];
  const source: number[] = [];
  const target: number[] = [];
  SERVICES.forEach(([, hubs], k) => {
    for (const hub of hubs) {
      source.push(HUBS.length + k);
      target.push(hub);
    }
  });
  const pinned = (i: number): boolean => i < HUBS.length;
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        arrangement: 'force',
        force: { linkdistance: 70, charge: -160 },
        node: {
          label,
          // Only the hubs have positions: they are pinned.
          x: label.map((_, i) => (pinned(i) ? PINS[i]![0] : null)),
          y: label.map((_, i) => (pinned(i) ? PINS[i]![1] : null)),
          group: label.map((_, i) => (pinned(i) ? 'Pinned' : 'Free')),
          symbol: label.map((_, i) => (pinned(i) ? 'diamond' : 'circle')),
          size: label.map((_, i) => (pinned(i) ? 20 : 12)),
        },
        link: { source, target },
      },
    ],
    layout: {
      title: { text: 'Services between three pinned hubs' },
      margin: { l: 20, r: 20, t: 60, b: 20 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
