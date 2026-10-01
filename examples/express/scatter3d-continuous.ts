import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { iris } from './datasets.mts';

/**
 * Express 3D scatter with continuous color, sizes and symbols (plan E23.6), as the px docs'
 * `px.scatter_3d(df, color='petal_length', size='petal_length', size_max=18, symbol='species',
 * opacity=0.7)`: the numeric `color` maps petal length through the default look's sequential
 * colorscale on a shared `coloraxis` with a colorbar, `size` scales the marker areas (the largest
 * `sizeMax` px across) and `symbol` makes one trace per species.
 */
export const meta: ExampleMeta = {
  title: 'Express: 3D scatter with a colorscale, sizes and symbols',
  description:
    'Iris-like flowers in 3D, colored and sized by petal length, one marker symbol per species.',
  tags: ['express', 'scatter3d', '3d', 'scene', 'coloraxis', 'colorbar', 'bubble'],
  size: { width: 640, height: 480 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const figure = hx.scatter3d(iris(), {
    x: 'sepal_length',
    y: 'sepal_width',
    z: 'petal_width',
    color: 'petal_length',
    size: 'petal_length',
    sizeMax: 18,
    symbol: 'species',
    opacity: 0.7,
    labels: {
      sepal_length: 'Sepal length',
      sepal_width: 'Sepal width',
      petal_width: 'Petal width',
      petal_length: 'Petal length',
    },
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
