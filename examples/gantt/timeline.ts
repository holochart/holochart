import { createChart, timeline } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Gantt chart with the `timeline` helper (plan E9.14), Holochart's `px.timeline`: each row of a
 * table becomes a horizontal bar from its start to its finish date. The helper builds a plain
 * figure: `bar` traces with `base` = the start date and `x` = the duration in ms, a date x axis,
 * `barmode: 'overlay'`, and rows listed top-down.
 */
export const meta: ExampleMeta = {
  title: 'Gantt: project timeline',
  description:
    'A seven-task project plan built with the timeline helper: bars from start to finish dates, first task on top.',
  tags: ['gantt', 'timeline', 'bar', 'date', 'horizontal'],
  testTolerance: 0.004,
};

const TASKS = [
  { Task: 'Research', Start: '2026-01-05', Finish: '2026-01-23' },
  { Task: 'Requirements', Start: '2026-01-19', Finish: '2026-02-06' },
  { Task: 'UX design', Start: '2026-02-02', Finish: '2026-02-27' },
  { Task: 'Backend', Start: '2026-02-16', Finish: '2026-04-03' },
  { Task: 'Frontend', Start: '2026-03-02', Finish: '2026-04-17' },
  { Task: 'QA', Start: '2026-04-06', Finish: '2026-04-30' },
  { Task: 'Launch prep', Start: '2026-04-27', Finish: '2026-05-08' },
];

export function run(el: HTMLElement): ExampleHandle {
  const figure = timeline({
    data: TASKS,
    xStart: 'Start',
    xEnd: 'Finish',
    y: 'Task',
    title: 'Product launch plan',
  });
  const chart = createChart(el, figure);

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
