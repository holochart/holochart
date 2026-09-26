import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { iris } from './datasets.mts';

/**
 * A scatter plot matrix with `hx.scatterMatrix` (`px.scatter_matrix`): one `splom` trace per
 * species over the four numeric columns (the default dimensions: every numeric column not used by
 * another option), labels from `labels`, the diagonal hidden, and box / lasso selection
 * (`dragmode: 'select'`) highlighting the same flowers in every cell.
 */
export const meta: ExampleMeta = {
  title: 'Express: scatter matrix',
  description: 'Every pair of four iris measurements, one trace per species, from row objects.',
  tags: ['express', 'splom', 'statistical', 'grouping'],
  size: { width: 640, height: 600 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const figure = hx.scatterMatrix(iris(), {
    color: 'species',
    labels: {
      sepal_length: 'sepal length',
      sepal_width: 'sepal width',
      petal_length: 'petal length',
      petal_width: 'petal width',
    },
    title: 'Iris measurements (cm)',
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
