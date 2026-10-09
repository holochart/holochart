import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A directed graph (backlog G1): `link.arrow.end` draws an arrowhead at the target of every
 * link. The heads stop at the edge of their node, whatever its size, so they stay readable next
 * to large nodes. Two links between the same two states are fanned out into curves so that both
 * show (review ⇄ changes requested), and a link from a state to itself is a loop (a draft that is
 * edited stays a draft); loops point away from their node's links and label. `link.width` is one
 * value per link here.
 */
export const meta: ExampleMeta = {
  title: 'Graph: directed, with parallel links and loops',
  description: 'A state machine: arrowheads at node edges, curved parallel links, self-loops.',
  tags: ['graph', 'network', 'directed', 'arrows', 'loops'],
  testTolerance: 0.004,
};

const STATES: readonly (readonly [string, number, number, number])[] = [
  ['Draft', 0, 1, 26],
  ['In review', 2, 2, 34],
  ['Changes requested', 2, 0, 22],
  ['Approved', 4, 2, 26],
  ['Merged', 6, 1, 30],
  ['Closed', 4, 0, 18],
];

/** Source, target, width. */
const MOVES: readonly (readonly [number, number, number])[] = [
  [0, 0, 1.5],
  [0, 1, 3],
  [1, 2, 2],
  [2, 1, 2],
  [1, 3, 3],
  [3, 4, 3],
  [2, 5, 1],
  [0, 5, 1],
  [3, 1, 1],
  [2, 2, 1.5],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        node: {
          label: STATES.map((s) => s[0]),
          x: STATES.map((s) => s[1]),
          y: STATES.map((s) => s[2]),
          size: STATES.map((s) => s[3]),
          color: '#4c78a8',
          textposition: 'bottom center',
        },
        link: {
          source: MOVES.map((m) => m[0]),
          target: MOVES.map((m) => m[1]),
          width: MOVES.map((m) => m[2]),
          arrow: { end: true, size: 10 },
        },
      },
    ],
    layout: {
      title: { text: 'Life of a pull request' },
      xaxis: { visible: false },
      yaxis: { visible: false, scaleanchor: 'x' },
      margin: { l: 40, r: 40, t: 60, b: 40 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
