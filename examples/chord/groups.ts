import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Groups on a chord diagram (backlog G8): with `node.group`, the nodes of a group sit next to
 * each other and share a color, a wider gap separates the groups (`groups.padangle`), and an
 * outer ring draws one labeled arc around each. The legend lists the groups; click one to take
 * it out of the ring. The data: messages between the teams of three departments (invented
 * numbers), undirected, so every link is one band as wide at both ends.
 */
export const meta: ExampleMeta = {
  title: 'Chord: groups',
  description: 'Teams grouped by department, with an outer ring of group arcs and a legend.',
  tags: ['chord', 'network', 'groups', 'legend', 'domain'],
  size: { width: 680, height: 600 },
  testTolerance: 0.004,
};

/** Team, department. */
const TEAMS: readonly (readonly [string, string])[] = [
  ['Design', 'Product'],
  ['Research', 'Product'],
  ['Roadmap', 'Product'],
  ['Web', 'Engineering'],
  ['Mobile', 'Engineering'],
  ['Platform', 'Engineering'],
  ['Data', 'Engineering'],
  ['Sales', 'Business'],
  ['Support', 'Business'],
  ['Finance', 'Business'],
];

/** `[team, team, messages per week]`. */
const MESSAGES: readonly (readonly [number, number, number])[] = [
  [0, 1, 40],
  [0, 2, 25],
  [0, 3, 60],
  [0, 4, 45],
  [1, 2, 30],
  [1, 8, 20],
  [2, 3, 22],
  [2, 7, 35],
  [3, 4, 50],
  [3, 5, 55],
  [4, 5, 38],
  [5, 6, 48],
  [6, 9, 15],
  [6, 2, 18],
  [7, 8, 42],
  [7, 9, 28],
  [8, 3, 26],
  [8, 4, 21],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'chord',
        directed: false,
        node: {
          label: TEAMS.map((t) => t[0]),
          group: TEAMS.map((t) => t[1]),
          line: { width: 1 },
        },
        link: {
          source: MESSAGES.map((m) => m[0]),
          target: MESSAGES.map((m) => m[1]),
          value: MESSAGES.map((m) => m[2]),
        },
      },
    ],
    layout: {
      title: { text: 'Messages between teams' },
      margin: { l: 20, r: 20, t: 60, b: 20 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
