import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Express sunburst from names and parents (plan E23.6): `px.sunburst(df, names='item',
 * parents='parent', values='amount', branchvalues='total')` — a table that already names each
 * row's parent, passed through as `labels`, `parents` and `values`. With `branchvalues: 'total'`
 * a branch's amount is its total, so the Operations ring leaves a gap where its teams don't use
 * all of it.
 */
export const meta: ExampleMeta = {
  title: 'Express: sunburst from names and parents',
  description: 'A budget split by department and team from a table of items and their parents.',
  tags: ['express', 'sunburst', 'hierarchical', 'branchvalues'],
  size: { width: 560, height: 480 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

const CHARACTERS = '0123456789.,- ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz&';

const BUDGET = [
  { item: 'Budget', parent: '', amount: 1000 },
  { item: 'Engineering', parent: 'Budget', amount: 520 },
  { item: 'Platform', parent: 'Engineering', amount: 240 },
  { item: 'Apps', parent: 'Engineering', amount: 180 },
  { item: 'Data', parent: 'Engineering', amount: 100 },
  { item: 'Sales', parent: 'Budget', amount: 280 },
  { item: 'EMEA', parent: 'Sales', amount: 120 },
  { item: 'Americas', parent: 'Sales', amount: 160 },
  { item: 'Operations', parent: 'Budget', amount: 200 },
  { item: 'Finance', parent: 'Operations', amount: 70 },
  { item: 'People', parent: 'Operations', amount: 60 },
];

export function run(el: HTMLElement): ExampleHandle {
  const figure = hx.sunburst(BUDGET, {
    names: 'item',
    parents: 'parent',
    values: 'amount',
    branchvalues: 'total',
    title: 'Budget by department and team',
  });
  let chart: Chart | undefined;
  let disposed = false;
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, figure);
    await componentsReady(chart);
  });
  return {
    ready,
    get renderer() {
      return chart?.three.renderer;
    },
    dispose: () => {
      disposed = true;
      chart?.destroy();
    },
  };
}
