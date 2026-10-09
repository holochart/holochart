import { createChart, type Chart, type Data } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { DEPENDENCIES, dependencyOrder, packageGraph, WORKSPACES } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The package dependency graph as a matrix: `hx.adjacencyMatrix` of Express returns a `heatmap`
 * with a row and a column per package and a filled cell where the row's package depends on the
 * column's. `order` takes the node indices from the bottom of the graph up, so every dependency
 * of a package is to its left: all the cells are below the diagonal, which is what a graph
 * without cycles looks like as a matrix. The 72 declared dependencies cross each other as links;
 * as cells they do not.
 *
 * The matrix is a `heatmap` trace, so this example does not import the graph package.
 */
export const meta: ExampleMeta = {
  title: 'This repository: the package dependencies as a matrix',
  description:
    'The declared dependencies between the 22 workspace packages as an adjacency matrix, ordered from the bottom of the dependency graph up.',
  tags: ['demo', 'express', 'heatmap', 'matrix', 'network', 'dependencies'],
  size: { width: 720, height: 680 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const g = packageGraph();
  const figure = hx.adjacencyMatrix(
    { node: { label: g.label }, link: { source: g.source, target: g.target }, directed: true },
    {
      order: dependencyOrder().order,
      colorContinuousScale: [
        [0, LOOK.grid],
        [1, LOOK.colorway[1]],
      ],
      labels: { source: 'Package', target: 'Depends on', value: 'Depends' },
      title: narrow
        ? ''
        : `${DEPENDENCIES.length} declared dependencies between ${WORKSPACES.length} packages`,
    },
  );

  const chart: Chart = createChart(chartEl, {
    // A pixel between the cells, so that a filled run reads as cells.
    data: figure.data.map((trace) => ({ ...trace, xgap: 1, ygap: 1 }) as Data),
    layout: {
      ...figure.layout,
      coloraxis: { ...(figure.layout?.coloraxis ?? {}), showscale: false },
      xaxis: {
        ...(figure.layout?.xaxis ?? {}),
        tickangle: -45,
        tickfont: { size: narrow ? 8 : 10 },
      },
      yaxis: { ...(figure.layout?.yaxis ?? {}), tickfont: { size: narrow ? 8 : 10 } },
      margin: { l: narrow ? 84 : 110, r: 16, t: narrow ? 12 : 56, b: narrow ? 84 : 110 },
    },
    config: chartConfig(narrow),
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
