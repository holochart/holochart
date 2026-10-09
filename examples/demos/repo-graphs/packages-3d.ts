import { createChart, type Chart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { dependencyOrder, DIRECT_DEPENDENCIES, packageGraph, WORKSPACES } from './analysis.mts';
import { chartConfig, frame, isNarrow, settled } from './ui.mts';

/**
 * The package dependency graph in space: `graph3d` with `arrangement: 'layered'` gives every
 * package a rank, as the 2D layered layout does, and makes each rank a plane (outlined by
 * `layered.showplanes`). Within its plane a package is placed by the force layout, so it sits
 * above what it depends on. Links are the direct dependencies, drawn as tubes with cones for
 * arrowheads that end on the spheres. The apps are in the top plane and `core` and `render`,
 * which depend on nothing, in the bottom one. Drag to orbit.
 */
export const meta: ExampleMeta = {
  title: 'This repository: the package dependencies in planes',
  description:
    'The workspace packages as a layered 3D graph: one plane per rank of the dependency graph, tube links with cone arrowheads, colored by kind.',
  tags: ['demo', 'graph3d', 'graph', '3d', 'layered', 'dag', 'arrows', 'dependencies'],
  size: { width: 960, height: 640 },
  testTolerance: 0.006,
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const g = packageGraph(true);
  const ranks = Math.max(...dependencyOrder().depth) + 1;

  const chart: Chart = createChart(chartEl, {
    data: [
      {
        type: 'graph3d',
        arrangement: 'layered',
        layered: { ranksep: 46 },
        // The force layout spreads the packages of a plane; gravity keeps the two tools that depend
        // on nothing from drifting away from the rest.
        force: { charge: -150, linkdistance: 50, gravity: 0.4 },
        node: {
          label: g.label,
          group: g.group,
          size: 13,
          textfont: { size: narrow ? 9 : 11 },
          customdata: WORKSPACES.map((w) => w.dir),
          hovertemplate: '<b>%{label}</b><br>%{customdata}<extra>%{group}</extra>',
        },
        link: {
          source: g.source,
          target: g.target,
          width: 3,
          arrow: { end: true, size: 13 },
          hovertemplate: '%{source.label} depends on %{target.label}<extra></extra>',
        },
      },
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : `${WORKSPACES.length} packages in ${ranks} planes, ` +
            `${DIRECT_DEPENDENCIES.length} direct dependencies`,
      },
      legend: { orientation: 'h', x: 0, y: 0, yanchor: 'bottom' },
      margin: { l: 0, r: 0, t: narrow ? 12 : 56, b: 0 },
      scene: { camera: { eye: { x: 0.9, y: 0.68, z: 0.43 } } },
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
