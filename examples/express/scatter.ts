import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { iris } from './datasets.mts';

/**
 * Express scatter (plan E23.2) from row objects: `symbol` groups the rows into one trace per
 * species (legend entries and marker symbols), while the numeric `color` maps petal length through
 * the template's sequential colorscale on a shared `coloraxis` with a colorbar, as `px.scatter`
 * does. `labels` rename the columns in the axis titles, hover lines and colorbar.
 */
export const meta: ExampleMeta = {
  title: 'Express: scatter with symbol groups and continuous color',
  description:
    'Iris-like flowers from row objects: one trace per species by symbol, petal length on a colorscale.',
  tags: ['express', 'scatter', 'coloraxis', 'colorbar', 'grouping'],
  size: { width: 640, height: 420 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const figure = hx.scatter(iris(), {
    x: 'sepal_width',
    y: 'sepal_length',
    color: 'petal_length',
    symbol: 'species',
    labels: {
      sepal_width: 'Sepal width (cm)',
      sepal_length: 'Sepal length (cm)',
      petal_length: 'Petal length',
    },
    title: 'Iris sepals, colored by petal length',
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
