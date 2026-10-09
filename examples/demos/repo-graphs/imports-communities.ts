import { createChart, type Chart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { directoryMatch, packageModules, percent } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, segmented, settled } from './ui.mts';

/**
 * The modules of `imports-force` in its ForceAtlas2 layout (with `linlog`, which pulls clusters
 * tight), colored by the communities that `louvain` (a helper of the graph package) finds in the
 * imports: groups of modules that import each other
 * more than they import the rest. The toggle puts the directories back (`node.group`, with
 * `chart.restyle`); the positions stay, since the layout does not read the groups, so the nodes
 * that change color are the ones the two partitions disagree about.
 *
 * `louvain` is deterministic (nodes are visited in index order), so the communities, their
 * numbering and the picture are the same on every run.
 */
export const meta: ExampleMeta = {
  title: 'This repository: communities of modules against directories',
  description:
    'The modules of the graph package colored by Louvain community, with a toggle back to their directories: how well the folders match the import structure.',
  tags: ['demo', 'graph', 'network', 'force', 'louvain', 'community', 'groups', 'restyle'],
  size: { width: 960, height: 640 },
  testTolerance: 0.004,
};

const PACKAGE = 'traces-graph';

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);

  const g = packageModules(PACKAGE);
  const match = directoryMatch(g);
  const communities = match.community.map((c) => `Community ${c + 1}`);
  const legend = (title: string): Record<string, unknown> =>
    narrow
      ? { orientation: 'h', x: 0, y: 0, yanchor: 'top' }
      : { title: { text: title }, font: { color: LOOK.text } };

  const chart: Chart = createChart(chartEl, {
    data: [
      {
        type: 'graph',
        arrangement: 'force',
        force: { algorithm: 'forceatlas2', linlog: true },
        node: {
          label: g.label,
          group: communities,
          sizeby: 'indegree',
          sizerange: [6, 30],
          textfont: { size: narrow ? 8 : 10 },
          customdata: g.group.map((dir, i) => `${dir}/ · ${communities[i]!}`),
          hovertemplate:
            '<b>%{label}.ts</b><br>%{customdata}<br>imported by %{indegree} modules<extra></extra>',
        },
        link: { source: g.source, target: g.target, width: 0.75, hoverinfo: 'skip' },
      },
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : `${match.communities} communities, ${match.directories} directories: ` +
            `${percent(match.share)} of the modules are where most of their directory is`,
      },
      legend: legend('Louvain community'),
      margin: { l: 12, r: 12, t: narrow ? 12 : 56, b: 12 },
    },
    config: chartConfig(narrow),
  });

  segmented(
    toolbar,
    'Color',
    [
      { value: 'community', text: 'Communities' },
      { value: 'directory', text: 'Directories' },
    ],
    (value) => {
      const byCommunity = value === 'community';
      void chart.updateAttributes(
        { 'node.group': [byCommunity ? communities : g.group] },
        { 'legend.title.text': byCommunity ? 'Louvain community' : 'Directory' },
      );
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
