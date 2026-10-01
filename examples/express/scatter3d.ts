import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { iris } from './datasets.mts';

/**
 * Express 3D scatter (plan E23.6): `px.scatter_3d` on the iris-like table — sepal length, sepal
 * width and petal width on the scene's axes, one `scatter3d` trace per species by color with a
 * legend, the axis titles taken from `labels`.
 */
export const meta: ExampleMeta = {
  title: 'Express: 3D scatter grouped by color',
  description:
    'Iris-like flowers in 3D: sepal length, sepal width and petal width, one colored trace per species.',
  tags: ['express', 'scatter3d', '3d', 'scene', 'grouping'],
  size: { width: 640, height: 480 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const figure = hx.scatter3d(iris(), {
    x: 'sepal_length',
    y: 'sepal_width',
    z: 'petal_width',
    color: 'species',
    labels: {
      sepal_length: 'Sepal length (cm)',
      sepal_width: 'Sepal width (cm)',
      petal_width: 'Petal width (cm)',
      species: 'Species',
    },
    title: 'Iris flowers in 3D',
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
