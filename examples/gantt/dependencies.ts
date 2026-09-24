import { createChart, timeline } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Gantt chart with dependencies (plan E9.14): each finish-to-start dependency is an annotation
 * arrow without text, its head at the next task's start and its tail (`ax`, `ay` with
 * `axref: 'x'`, `ayref: 'y'`) at the previous task's end, both in data coordinates, so the arrows
 * follow the bars when zooming.
 */
export const meta: ExampleMeta = {
  title: 'Gantt: task dependencies',
  description:
    'Finish-to-start dependencies drawn as annotation arrows from one task’s end to the next task’s start.',
  tags: ['gantt', 'timeline', 'bar', 'annotations', 'date'],
  testTolerance: 0.004,
};

const TASKS = [
  { Task: 'Spec', Start: '2026-01-05', Finish: '2026-01-16' },
  { Task: 'Prototype', Start: '2026-01-21', Finish: '2026-02-06' },
  { Task: 'Review', Start: '2026-02-11', Finish: '2026-02-18' },
  { Task: 'Build', Start: '2026-02-23', Finish: '2026-03-27' },
  { Task: 'Docs', Start: '2026-02-23', Finish: '2026-03-13' },
  { Task: 'Release', Start: '2026-04-01', Finish: '2026-04-08' },
];

/** Finish-to-start dependencies: [before, after]. */
const DEPENDENCIES: [string, string][] = [
  ['Spec', 'Prototype'],
  ['Prototype', 'Review'],
  ['Review', 'Build'],
  ['Review', 'Docs'],
  ['Build', 'Release'],
  ['Docs', 'Release'],
];

export function run(el: HTMLElement): ExampleHandle {
  const byName = new Map(TASKS.map((t) => [t.Task, t]));
  const annotations = DEPENDENCIES.map(([from, to]) => {
    const a = byName.get(from)!;
    const b = byName.get(to)!;
    return {
      x: b.Start,
      y: b.Task,
      ax: a.Finish,
      ay: a.Task,
      axref: 'x',
      ayref: 'y',
      text: '',
      showarrow: true,
      arrowhead: 2,
      arrowwidth: 1,
      standoff: 1,
    };
  });
  const figure = timeline({
    data: TASKS,
    xStart: 'Start',
    xEnd: 'Finish',
    y: 'Task',
    title: 'Dependencies',
  });
  figure.layout['annotations'] = annotations;
  const chart = createChart(el, figure);

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
