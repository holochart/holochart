import { createChart, type Chart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { count, mostImported, PACKAGE_DIRS, repoModules } from './analysis.mts';
import { chartConfig, frame, groupColorway, isNarrow, packageColor, settled } from './ui.mts';

/**
 * Every source module of every package and every import between them, as a `graph3d` trace: the
 * force layout (here ForceAtlas2) runs in three dimensions, which gives a graph of this size room
 * that a plane does not have. Nodes are lit spheres colored by package (`node.group`; the legend hides a package on
 * a click) and sized by the number of modules that import them, so each package's entry module
 * is the large sphere its modules gather around, and the entry module of `core` the largest.
 * Links are screen-space lines, kept faint. Drag to orbit, scroll to zoom, hover a sphere for the
 * module's name.
 */
export const meta: ExampleMeta = {
  title: 'This repository: every module and import, in 3D',
  description:
    'About a thousand source modules of the Holochart packages and their imports as a 3D force-directed network, colored by package and sized by importers.',
  tags: ['demo', 'graph3d', 'graph', 'network', '3d', 'force', 'groups', 'large'],
  size: { width: 960, height: 640 },
  testTolerance: 0.006,
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const g = repoModules();
  const top = mostImported(g);

  const chart: Chart = createChart(chartEl, {
    data: [
      {
        type: 'graph3d',
        arrangement: 'force',
        // ForceAtlas2 with `linlog` pulls each package's modules into a tight cluster around its
        // entry module and pushes the clusters apart.
        force: { algorithm: 'forceatlas2', linlog: true },
        node: {
          label: g.label,
          group: g.group,
          sizeby: 'indegree',
          sizerange: [4, 34],
          textposition: 'none',
          hovertemplate:
            '<b>%{label}.ts</b><br>imported by %{indegree} modules<br>imports %{outdegree}' +
            '<extra>%{group}</extra>',
        },
        link: {
          source: g.source,
          target: g.target,
          width: 1,
          render: 'line',
          opacity: 0.22,
          hoverinfo: 'skip',
        },
      },
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : `${count(g.label.length)} modules of ${PACKAGE_DIRS.length} packages, ` +
            `${count(g.source.length)} imports; ${top.importers} modules import ${top.label}.ts`,
      },
      colorway: groupColorway(g.group, packageColor),
      legend: narrow
        ? { orientation: 'h', x: 0, y: 0, yanchor: 'top' }
        : { title: { text: 'Package' } },
      margin: { l: 0, r: 0, t: narrow ? 12 : 56, b: 0 },
      scene: { camera: { eye: { x: 0.8, y: 0.8, z: 0.5 } } },
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
