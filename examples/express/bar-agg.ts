import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { tips } from './datasets.mts';

/**
 * Express aggregation (plan E23.5, a Holochart extension): `agg: 'avg'` turns the 244 tip rows
 * into one bar per day and sex — the mean tip of the rows sharing an x within each color group —
 * grouped side by side. The value axis and hover label read `avg of tip`, as a histogram's
 * `histfunc` would title it; `'sum'`, `'count'`, `'min'`, `'max'`, `'median'` or a function work
 * the same way.
 */
export const meta: ExampleMeta = {
  title: 'Express: bars aggregated with agg',
  description: 'Average tip per day and sex from row-level data, one grouped bar per pair.',
  tags: ['express', 'bar', 'aggregation', 'grouped', 'agg'],
  size: { width: 640, height: 400 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const figure = hx.bar(tips(), {
    x: 'day',
    y: 'tip',
    color: 'sex',
    agg: 'avg',
    barmode: 'group',
    categoryOrders: { day: ['Thu', 'Fri', 'Sat', 'Sun'] },
    title: 'Average tip per day',
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
