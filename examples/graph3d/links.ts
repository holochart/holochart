import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Self-links and parallel links (backlog G6): the states of a download and the events that move
 * it from one to the next. A link from a state to itself is a ring beside the node, on the side
 * away from its neighbours. Links between the same two states are fanned out as arcs so that each
 * can be seen and hovered: two opposite links bow apart (pause and resume), and so do two links
 * that run the same way. `link.curve` sets a curvature by hand. The arrowheads end on the spheres
 * along the curves.
 *
 * Hovering a state dims everything but its links and the states they lead to (`highlight`).
 */
export const meta: ExampleMeta = {
  title: 'Graph 3D: self-links and parallel links',
  description:
    'A state machine in space: rings for the links from a state to itself, arcs for the links between the same two states.',
  tags: ['graph3d', 'graph', 'network', '3d', 'self-links', 'parallel', 'arrows', 'highlight'],
  size: { width: 720, height: 520 },
  testTolerance: 0.004,
};

const STATES = ['Idle', 'Connecting', 'Receiving', 'Paused', 'Retrying', 'Done', 'Failed'];

/** `[from, to, event]`, as indices into `STATES`. */
const EVENTS: readonly (readonly [number, number, string])[] = [
  [0, 1, 'start'],
  [1, 2, 'connected'],
  [2, 2, 'chunk'],
  [2, 3, 'pause'],
  [3, 2, 'resume'],
  [2, 5, 'last chunk'],
  [1, 4, 'refused'],
  [2, 4, 'dropped'],
  [4, 1, 'retry'],
  [4, 4, 'wait'],
  [4, 4, 'wait longer'],
  [4, 6, 'gave up'],
  [5, 0, 'next file'],
  [5, 0, 'same file again'],
  [6, 0, 'reset'],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'graph3d',
        node: { label: STATES, size: 22, color: '#4c78a8' },
        link: {
          source: EVENTS.map((e) => e[0]),
          target: EVENTS.map((e) => e[1]),
          label: EVENTS.map((e) => e[2]),
          width: 3,
          color: '#8a94a6',
          arrow: { end: true, size: 13 },
        },
        force: { linkdistance: 90 },
      },
    ],
    layout: {
      title: { text: 'A download and the events that move it' },
      margin: { l: 0, r: 0, t: 50, b: 0 },
      // Seen from the side where the rings and the arcs lie flat to the view.
      scene: { camera: { eye: { x: -0.8, y: 0.8, z: 0.8 } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
