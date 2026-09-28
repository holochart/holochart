import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { tips } from './datasets.mts';

/**
 * Express treemap with a discrete color (plan E13.1, E23.6): `px.treemap(df, path=['day', 'time',
 * 'sex'], values='total_bill', color='time', color_discrete_map={'(?)': …, 'Lunch': 'gold',
 * 'Dinner': 'darkblue'})` on the synthetic tips table. Every node takes its rows' meal time when
 * they agree; Friday, which serves both, is `'(?)'` and takes that key's color.
 */
export const meta: ExampleMeta = {
  title: 'Express: treemap with a discrete color',
  description:
    'Restaurant bills by day, meal and sex as nested rectangles, colored by meal time with (?) for mixed days.',
  tags: ['express', 'treemap', 'hierarchical', 'path', 'color'],
  size: { width: 640, height: 480 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

const CHARACTERS = '0123456789.,-()? ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function run(el: HTMLElement): ExampleHandle {
  const figure = hx.treemap(tips(), {
    path: ['day', 'time', 'sex'],
    values: 'total_bill',
    color: 'time',
    colorDiscreteMap: { '(?)': '#8c8c8c', Lunch: 'gold', Dinner: 'darkblue' },
    title: 'Bills by day, meal and sex',
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
