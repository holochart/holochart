import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Uneven cells (plan E11.1): `x` and `y` give the cell edges (one more value than columns and
 * rows), so cells have different widths and heights — still one texture, the shader finds each
 * fragment's cell with a binary search of an edge texture. `connectgaps` fills the missing values
 * with Plotly's neighbour average.
 */
export const meta: ExampleMeta = {
  title: 'Heatmap: uneven cells and gaps',
  description: 'Cells of varying width and height from edge arrays, with gaps filled.',
  tags: ['heatmap', 'scientific', 'connectgaps', 'irregular'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const xEdges = [0, 1, 1.5, 2, 3, 5, 8, 13, 21];
  const yEdges = [0, 0.5, 1, 2, 4, 8];
  const z = yEdges
    .slice(1)
    .map((_, j) =>
      xEdges.slice(1).map((_, i) => ((i * 7 + j * 3) % 5 === 0 ? null : Math.sin(i / 2) + j / 3)),
    );
  const chart = createChart(el, {
    data: [
      {
        type: 'heatmap',
        x: xEdges,
        y: yEdges,
        z,
        connectgaps: true,
        colorscale: 'Viridis',
      },
    ],
    layout: { title: { text: 'Fibonacci columns, doubling rows' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
