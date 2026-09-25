import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * An iris-like scatter plot matrix (plan E10.9): four flower measurements of three species, one
 * `splom` trace per species so the legend names them. Every dimension gets an x axis (its column)
 * and a y axis (its row), titled by its label and laid out as a grid; the diagonal plots each
 * dimension against itself. Each dimension is uploaded to the GPU once and shared by every cell.
 */
export const meta: ExampleMeta = {
  title: 'Scatter plot matrix: iris',
  description:
    'Four measurements of three species, every pair plotted against each other; one trace per species.',
  tags: ['splom', 'statistical', 'basic'],
  size: { width: 640, height: 600 },
  testTolerance: 0.004,
};

/** Synthetic iris-like samples: means and spreads per species, petal size tied to sepal size. */
function species(seed: number, n: number, mean: number[], sd: number[]): number[][] {
  const normal = gaussian(rng(seed));
  const cols: number[][] = [[], [], [], []];
  for (let i = 0; i < n; i++) {
    const size = normal();
    for (let d = 0; d < 4; d++) {
      const shared = d === 1 ? 0.4 : 0.7;
      const v = mean[d]! + sd[d]! * (shared * size + Math.sqrt(1 - shared * shared) * normal());
      cols[d]!.push(Math.round(v * 10) / 10);
    }
  }
  return cols;
}

const LABELS = ['sepal length', 'sepal width', 'petal length', 'petal width'];
const SPECIES = [
  { name: 'setosa', mean: [5.0, 3.4, 1.46, 0.24], sd: [0.35, 0.38, 0.17, 0.1] },
  { name: 'versicolor', mean: [5.9, 2.8, 4.26, 1.33], sd: [0.52, 0.31, 0.47, 0.2] },
  { name: 'virginica', mean: [6.6, 3.0, 5.55, 2.03], sd: [0.64, 0.32, 0.55, 0.27] },
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: SPECIES.map((s, k) => {
      const cols = species(k + 1, 50, s.mean, s.sd);
      return {
        type: 'splom',
        name: s.name,
        dimensions: LABELS.map((label, d) => ({ label, values: cols[d]! })),
      };
    }),
    layout: { title: { text: 'Iris measurements (cm)' } },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
