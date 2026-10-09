import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A graph with cycles in layers (backlog G3): a state machine goes round, so not every link can
 * point down. The layout turns as few links around as it can to give the others one direction,
 * and those links are drawn in the `link.secondary` style, dashed and a little fainter, with
 * their arrowheads still pointing the way the data says: here the retry after a failure, and one
 * link of the loop of sending, waiting and being ready again. A link from a state to itself is
 * drawn as a loop.
 */
export const meta: ExampleMeta = {
  title: 'Graph: layered state machine with cycles',
  description: 'Back edges of a cyclic graph drawn dashed in a layered diagram.',
  tags: ['graph', 'layered', 'cycle', 'state machine', 'diagram', 'directed'],
  size: { width: 640, height: 560 },
  testTolerance: 0.004,
};

const STATES = [
  'Idle',
  'Connecting',
  'Authenticating',
  'Ready',
  'Sending',
  'Waiting',
  'Failed',
  'Closed',
];

/** From, to, what triggers it. */
const TRANSITIONS: readonly (readonly [number, number, string])[] = [
  [0, 1, 'connect'],
  [1, 2, 'socket open'],
  [2, 3, 'token accepted'],
  [3, 4, 'send'],
  [4, 5, 'sent'],
  [5, 3, 'reply'],
  [5, 5, 'heartbeat'],
  [1, 6, 'timeout'],
  [2, 6, 'token refused'],
  [5, 6, 'timeout'],
  [6, 1, 'retry'],
  [6, 7, 'give up'],
  [3, 7, 'close'],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        arrangement: 'layered',
        layered: { ranksep: 40, nodesep: 36 },
        node: {
          label: STATES,
          color: STATES.map((s) =>
            s === 'Failed' ? '#c0504d' : s === 'Closed' ? '#6b7280' : '#4a7f6f',
          ),
        },
        link: {
          source: TRANSITIONS.map((t) => t[0]),
          target: TRANSITIONS.map((t) => t[1]),
          label: TRANSITIONS.map((t) => t[2]),
          width: 1.5,
        },
      },
    ],
    layout: {
      title: { text: 'A connection and its retries' },
      margin: { l: 20, r: 20, t: 60, b: 20 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
