import { createChart, type Chart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  DEPENDENCIES,
  dependents,
  DIRECT_DEPENDENCIES,
  packageGraph,
  WORKSPACES,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, segmented, settled } from './ui.mts';

/**
 * The workspace packages of this monorepo and what each depends on, read from their
 * `package.json` files: a `graph` trace with `arrangement: 'layered'`. Every link points down,
 * from a package to one it depends on, so what everything rests on ends up at the bottom. Nodes
 * are boxes around their names (the default of this arrangement), and `layered.clusters` frames
 * the three kinds of workspace: packages, tools, apps and examples.
 *
 * The toggle swaps `link.source` / `link.target` with `chart.restyle` between the direct
 * dependencies (those no other dependency implies) and everything the manifests declare; the
 * layout runs again, since both are `calc` attributes.
 */
export const meta: ExampleMeta = {
  title: 'This repository: the package dependency graph',
  description:
    'The 22 workspace packages of the Holochart monorepo as a layered diagram: box nodes, clusters by kind, direct or all declared dependencies.',
  tags: ['demo', 'graph', 'layered', 'dag', 'clusters', 'dependencies', 'restyle'],
  size: { width: 960, height: 600 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);

  const direct = packageGraph(true);
  const declared = packageGraph(false);
  const used = dependents();
  const needs = WORKSPACES.map((_, i) => DEPENDENCIES.filter((d) => d[0] === i).length);
  const hover = WORKSPACES.map(
    (w, i) =>
      `<b>${w.name}</b><br>${w.dir}<br>` +
      `depends on ${needs[i]!} workspace packages<br>` +
      `${used.all[i]!} depend on it, ${used.direct[i]!} of them directly`,
  );

  const chart: Chart = createChart(chartEl, {
    data: [
      {
        type: 'graph',
        arrangement: 'layered',
        layered: { clusters: true, ranksep: 34, nodesep: 14, clusterpadding: 10 },
        node: {
          label: direct.label,
          group: direct.group,
          textfont: { size: narrow ? 9 : 12 },
          customdata: hover,
          hovertemplate: '%{customdata}<extra></extra>',
        },
        link: { source: direct.source, target: direct.target, width: 1.25 },
      },
    ],
    layout: {
      title: {
        text: narrow ? '' : `${WORKSPACES.length} workspace packages and their dependencies`,
      },
      showlegend: false,
      margin: { l: 12, r: 12, t: narrow ? 12 : 56, b: 12 },
    },
    config: chartConfig(narrow),
  });

  segmented(
    toolbar,
    'Dependencies',
    [
      { value: 'direct', text: `Direct (${DIRECT_DEPENDENCIES.length})` },
      { value: 'declared', text: `All declared (${DEPENDENCIES.length})` },
    ],
    (value) => {
      const g = value === 'direct' ? direct : declared;
      void chart.restyle({ 'link.source': [g.source], 'link.target': [g.target] });
    },
  );

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
