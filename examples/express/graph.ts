import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Express network (backlog G9): `hx.graph` on an edge table (one row per pair, with the two names
 * and a count) and a node table (one row per person). The edges' `reviewer` and `author` refer to
 * the nodes' `name`; `color: 'team'` gives every team a color and a legend item, `size: 'degree'`
 * sizes people by their number of links, `directed` draws the arrowheads, and the trace's force
 * layout places the nodes. Graphs are not part of the full bundle (ADR-029): the second import
 * registers them.
 */
export const meta: ExampleMeta = {
  title: 'Express: a network from an edge table',
  description:
    'Code reviews between fourteen people, from an edge table and a node table: colored by team, sized by links.',
  tags: ['express', 'graph', 'network', 'edges', 'grouping', 'force'],
  size: { width: 760, height: 520 },
  testTolerance: 0.004,
};

/** Name, team, role. */
const PEOPLE: readonly (readonly [string, string, string])[] = [
  ['Ada', 'Platform', 'lead'],
  ['Bo', 'Platform', 'engineer'],
  ['Cyd', 'Platform', 'engineer'],
  ['Dev', 'Platform', 'engineer'],
  ['Eli', 'Platform', 'intern'],
  ['Fay', 'Apps', 'lead'],
  ['Gus', 'Apps', 'engineer'],
  ['Hal', 'Apps', 'engineer'],
  ['Ivy', 'Apps', 'designer'],
  ['Jo', 'Apps', 'engineer'],
  ['Kai', 'Data', 'lead'],
  ['Lea', 'Data', 'analyst'],
  ['Max', 'Data', 'engineer'],
  ['Nia', 'Data', 'analyst'],
];

/** Reviewer, author, reviews in the last quarter. */
const REVIEWS: readonly (readonly [string, string, number])[] = [
  ['Ada', 'Bo', 9],
  ['Ada', 'Cyd', 6],
  ['Bo', 'Cyd', 4],
  ['Ada', 'Dev', 5],
  ['Dev', 'Eli', 7],
  ['Bo', 'Eli', 3],
  ['Fay', 'Gus', 8],
  ['Fay', 'Hal', 5],
  ['Gus', 'Hal', 6],
  ['Hal', 'Ivy', 4],
  ['Ivy', 'Jo', 7],
  ['Fay', 'Jo', 3],
  ['Kai', 'Lea', 9],
  ['Kai', 'Max', 5],
  ['Lea', 'Max', 6],
  ['Max', 'Nia', 4],
  ['Lea', 'Nia', 3],
  ['Ada', 'Fay', 4],
  ['Cyd', 'Kai', 3],
  ['Hal', 'Lea', 2],
  ['Eli', 'Jo', 2],
  ['Bo', 'Max', 1],
];

export function run(el: HTMLElement): ExampleHandle {
  const people = PEOPLE.map(([name, team, role]) => ({ name, team, role }));
  const reviews = REVIEWS.map(([reviewer, author, count]) => ({ reviewer, author, count }));
  const figure = hx.graph(reviews, {
    source: 'reviewer',
    target: 'author',
    weight: 'count',
    nodes: people,
    id: 'name',
    color: 'team',
    size: 'degree',
    hoverData: ['role'],
    directed: true,
    labels: { team: 'Team', count: 'Reviews', reviewer: 'Reviewer', author: 'Author' },
    title: 'Who reviews whose code',
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
