import { addVline, createChart, timeline } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Gantt chart with a "today" line (plan E9.14): `addVline` (plotly.py's `add_vline`) adds a
 * vertical line shape at a date across the whole plot height, with a level label at its top end. Tasks
 * are colored by their status on that date, with `colorDiscreteMap` pinning one color per status.
 * The date is fixed so the example renders the same every day.
 */
export const meta: ExampleMeta = {
  title: 'Gantt: today line',
  description:
    'A labeled vertical line at a fixed "today" date with addVline, and tasks colored by status on that date.',
  tags: ['gantt', 'timeline', 'bar', 'shapes', 'date'],
  testTolerance: 0.004,
};

/** A fixed "today" (use `new Date()` in an app). */
const TODAY = '2026-03-18';

const TASKS = [
  { Task: 'Research', Start: '2026-01-05', Finish: '2026-01-23' },
  { Task: 'Requirements', Start: '2026-01-19', Finish: '2026-02-06' },
  { Task: 'UX design', Start: '2026-02-02', Finish: '2026-02-27' },
  { Task: 'Backend', Start: '2026-02-16', Finish: '2026-04-03' },
  { Task: 'Frontend', Start: '2026-03-02', Finish: '2026-04-17' },
  { Task: 'QA', Start: '2026-04-06', Finish: '2026-04-30' },
  { Task: 'Launch prep', Start: '2026-04-27', Finish: '2026-05-08' },
];

function status(start: string, finish: string): string {
  if (finish <= TODAY) return 'Done';
  return start <= TODAY ? 'In progress' : 'Planned';
}

export function run(el: HTMLElement): ExampleHandle {
  const figure = timeline({
    data: TASKS.map((t) => ({ ...t, Status: status(t.Start, t.Finish) })),
    xStart: 'Start',
    xEnd: 'Finish',
    y: 'Task',
    color: 'Status',
    categoryOrders: { Status: ['Done', 'In progress', 'Planned'] },
    colorDiscreteMap: { Done: '#118e36', 'In progress': '#5e74d5', Planned: '#3e4258' },
    title: 'Status on March 18',
  });
  const chart = createChart(el, figure);
  const ready = chart.ready.then(() =>
    addVline(chart, TODAY, {
      line: { dash: 'dash' },
      // Level text just right of the line's top end, inside the plot area.
      label: { text: 'Today', textposition: 'end', textangle: 0, xanchor: 'left', yanchor: 'top' },
    }),
  );

  return {
    ready: ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
