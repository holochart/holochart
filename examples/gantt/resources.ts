import { createChart, timeline } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Gantt chart grouped by resource (plan E9.14): `color: 'Team'` makes one bar trace per team, in
 * the order of `categoryOrders`, with the column name as the legend title. Colors come from the
 * template's colorway; pass `colorDiscreteMap` to pin them. Several tasks of one team share its
 * legend item, so a click on it hides all of them.
 */
export const meta: ExampleMeta = {
  title: 'Gantt: tasks colored by team',
  description:
    'A release plan with one color per team, a legend titled by the grouping column, and several tasks per team.',
  tags: ['gantt', 'timeline', 'bar', 'date', 'legend'],
  testTolerance: 0.004,
};

const TASKS = [
  { Task: 'Wireframes', Start: '2026-01-05', Finish: '2026-01-21', Team: 'Design' },
  { Task: 'Visual design', Start: '2026-01-19', Finish: '2026-02-13', Team: 'Design' },
  { Task: 'API schema', Start: '2026-01-12', Finish: '2026-01-30', Team: 'Backend' },
  { Task: 'Services', Start: '2026-02-02', Finish: '2026-03-13', Team: 'Backend' },
  { Task: 'Data migration', Start: '2026-03-02', Finish: '2026-03-20', Team: 'Backend' },
  { Task: 'App shell', Start: '2026-02-09', Finish: '2026-02-27', Team: 'Frontend' },
  { Task: 'Screens', Start: '2026-02-23', Finish: '2026-03-27', Team: 'Frontend' },
  { Task: 'Test plan', Start: '2026-02-16', Finish: '2026-03-06', Team: 'QA' },
  { Task: 'Regression', Start: '2026-03-23', Finish: '2026-04-10', Team: 'QA' },
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(
    el,
    timeline({
      data: TASKS,
      xStart: 'Start',
      xEnd: 'Finish',
      y: 'Task',
      color: 'Team',
      categoryOrders: { Team: ['Design', 'Backend', 'Frontend', 'QA'] },
      title: 'Release 2.0 by team',
    }),
  );

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
