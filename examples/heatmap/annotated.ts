import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * An annotated heatmap (plan E11.1): a correlation matrix on category axes, every cell labelled
 * with its value through `texttemplate: '%{z:.2f}'`. Labels are sized to fit the cells and drawn
 * black or white, whichever contrasts with the cell's color. A diverging colorscale centered on 0
 * (`zmid`) and 1 px gaps between cells.
 */
export const meta: ExampleMeta = {
  title: 'Heatmap: annotated correlation matrix',
  description: 'Correlations of six variables, each cell labelled with a contrasting color.',
  tags: ['heatmap', 'scientific', 'texttemplate', 'category', 'annotated'],
  size: { width: 560, height: 480 },
  testTolerance: 0.004,
};

const VARS = ['price', 'size', 'rooms', 'age', 'distance', 'rating'];
const R = [
  [1, 0.82, 0.71, -0.34, -0.58, 0.46],
  [0.82, 1, 0.88, -0.12, -0.31, 0.28],
  [0.71, 0.88, 1, -0.05, -0.22, 0.19],
  [-0.34, -0.12, -0.05, 1, 0.41, -0.52],
  [-0.58, -0.31, -0.22, 0.41, 1, -0.37],
  [0.46, 0.28, 0.19, -0.52, -0.37, 1],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'heatmap',
        x: VARS,
        y: VARS,
        z: R,
        zmid: 0,
        colorscale: 'RdBu',
        texttemplate: '%{z:.2f}',
        xgap: 1,
        ygap: 1,
        hovertemplate: '%{x} × %{y}: %{z:.2f}<extra></extra>',
      },
    ],
    layout: {
      title: { text: 'Correlation matrix' },
      yaxis: { autorange: 'reversed' },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
