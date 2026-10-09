import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Direction on a chord diagram (backlog G8): `link.arrowlen` draws the target end of every
 * ribbon as an arrowhead, and a `link.targetgap` larger than `link.gap` stops it short of the
 * ring, so a ribbon touches the arc it leaves and points at the arc it enters. The ribbons take
 * the color of their source. The data: who moved where between five regions (invented numbers);
 * the widest arrow on an arc shows where most of its people went.
 */
export const meta: ExampleMeta = {
  title: 'Chord: directed, with arrows',
  description: 'Moves between regions as ribbons that end in arrowheads at their target.',
  tags: ['chord', 'network', 'directed', 'arrows', 'domain'],
  size: { width: 560, height: 520 },
  testTolerance: 0.004,
};

const REGIONS = ['North', 'East', 'South', 'West', 'Islands'];

/** `[from, to, people in thousands]`. */
const MOVES: readonly (readonly [number, number, number])[] = [
  [0, 1, 42],
  [0, 2, 18],
  [0, 3, 9],
  [1, 0, 12],
  [1, 2, 55],
  [1, 4, 6],
  [2, 0, 8],
  [2, 3, 31],
  [2, 4, 14],
  [3, 0, 27],
  [3, 1, 16],
  [3, 2, 11],
  [4, 2, 22],
  [4, 3, 7],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'chord',
        valuesuffix: 'k',
        padangle: 4,
        node: { label: REGIONS, thickness: 14 },
        link: {
          source: MOVES.map((m) => m[0]),
          target: MOVES.map((m) => m[1]),
          value: MOVES.map((m) => m[2]),
          arrowlen: 12,
          gap: 1,
          targetgap: 5,
        },
      },
    ],
    layout: {
      title: { text: 'Who moved where' },
      margin: { l: 30, r: 30, t: 60, b: 30 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
