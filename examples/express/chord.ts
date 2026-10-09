import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Express chord diagram (backlog G8, G9): `hx.chord` on an edge table of moves between regions
 * (invented numbers) and a node table that says which side of the country a region is on.
 * `weight` sets the width of the ribbons; `color: 'side'` groups the regions, so that the regions
 * of a side sit together on the ring, share a color and get one legend item and an outer arc. The
 * chord trace is not part of the full bundle (ADR-029): the second import registers it.
 */
export const meta: ExampleMeta = {
  title: 'Express: chord diagram from an edge table',
  description:
    'Moves between six regions as ribbons, the regions grouped and colored by side of the country.',
  tags: ['express', 'chord', 'network', 'edges', 'grouping', 'domain'],
  size: { width: 640, height: 560 },
  testTolerance: 0.004,
};

/** Region and its side of the country. */
const REGIONS: readonly (readonly [string, string])[] = [
  ['Coast', 'West'],
  ['Islands', 'West'],
  ['Northlands', 'West'],
  ['Capital', 'East'],
  ['Highlands', 'East'],
  ['Delta', 'East'],
];

/** From, to, people who moved in a year (thousands). */
const MOVES: readonly (readonly [string, string, number])[] = [
  ['Coast', 'Capital', 42],
  ['Coast', 'Islands', 11],
  ['Coast', 'Northlands', 9],
  ['Islands', 'Coast', 23],
  ['Islands', 'Capital', 14],
  ['Northlands', 'Coast', 18],
  ['Northlands', 'Capital', 27],
  ['Northlands', 'Highlands', 6],
  ['Capital', 'Coast', 31],
  ['Capital', 'Delta', 12],
  ['Capital', 'Highlands', 8],
  ['Highlands', 'Capital', 36],
  ['Highlands', 'Delta', 7],
  ['Delta', 'Capital', 29],
  ['Delta', 'Coast', 10],
  ['Delta', 'Highlands', 5],
];

export function run(el: HTMLElement): ExampleHandle {
  const regions = REGIONS.map(([region, side]) => ({ region, side }));
  const moves = MOVES.map(([from, to, people]) => ({ from, to, people }));
  const figure = hx.chord(moves, {
    source: 'from',
    target: 'to',
    weight: 'people',
    nodes: regions,
    id: 'region',
    color: 'side',
    labels: { from: 'From', to: 'To', people: 'People (thousands)', side: 'Side' },
    title: 'Moves between regions',
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
