import { createChart, timeline } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Gantt chart with milestones (plan E9.14): a `scatter` trace of diamond markers
 * (`marker.symbol: 'diamond'`) at the milestone dates, on rows of their own. Listing every row in
 * `categoryOrders` places the milestone rows between the tasks, top-down.
 */
export const meta: ExampleMeta = {
  title: 'Gantt: milestones',
  description:
    'Task bars from the timeline helper plus diamond markers for milestones, on their own rows between the tasks.',
  tags: ['gantt', 'timeline', 'bar', 'scatter', 'markers', 'date'],
  testTolerance: 0.004,
};

const TASKS = [
  { Task: 'Research', Start: '2026-01-05', Finish: '2026-01-23' },
  { Task: 'UX design', Start: '2026-01-26', Finish: '2026-02-20' },
  { Task: 'Build', Start: '2026-02-23', Finish: '2026-04-10' },
  { Task: 'Beta testing', Start: '2026-04-13', Finish: '2026-05-01' },
];

const MILESTONES = [
  { name: 'Kickoff', date: '2026-01-05' },
  { name: 'Design sign-off', date: '2026-02-20' },
  { name: 'Launch', date: '2026-05-04' },
];

const ROWS = [
  'Kickoff',
  'Research',
  'UX design',
  'Design sign-off',
  'Build',
  'Beta testing',
  'Launch',
];

export function run(el: HTMLElement): ExampleHandle {
  const figure = timeline({
    data: TASKS,
    xStart: 'Start',
    xEnd: 'Finish',
    y: 'Task',
    categoryOrders: { Task: ROWS },
    title: 'Milestones',
  });
  figure.data.push({
    type: 'scatter',
    mode: 'markers',
    name: 'Milestone',
    x: MILESTONES.map((m) => m.date),
    y: MILESTONES.map((m) => m.name),
    marker: { symbol: 'diamond', size: 11 },
    hovertemplate: '%{y}: %{x|%b %d, %Y}<extra></extra>',
  });
  const chart = createChart(el, figure);

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
