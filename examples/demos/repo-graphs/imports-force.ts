import { createChart, type Chart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { mostImported, packageModules } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, segmented, settled } from './ui.mts';

/**
 * The source modules of one package (`packages/traces-graph`, the package that draws this chart)
 * and the imports among them, placed by the `force` arrangement: no positions are given. Nodes
 * are colored by their directory (`node.group`, which also gives the legend one item per
 * directory) and sized by how many modules import them (`node.sizeby: 'indegree'`). Labels are
 * culled where they would overlap, the most linked nodes keeping theirs; zooming in shows the
 * rest.
 *
 * The toggle sets `force.algorithm` with `chart.restyle`: springs with a rest length (the
 * default), or ForceAtlas2, in which a node repels in proportion to its degree, so the modules
 * that many others import push their neighbourhoods apart.
 */
export const meta: ExampleMeta = {
  title: 'This repository: the modules of one package, by directory',
  description:
    'The source modules of the graph package and their imports in a force-directed layout, colored by directory and sized by importers, with a ForceAtlas2 toggle.',
  tags: ['demo', 'graph', 'network', 'force', 'forceatlas2', 'groups', 'legend', 'restyle'],
  size: { width: 960, height: 640 },
  testTolerance: 0.004,
};

const PACKAGE = 'traces-graph';

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);

  const g = packageModules(PACKAGE);
  const top = mostImported(g);

  const chart: Chart = createChart(chartEl, {
    data: [
      {
        type: 'graph',
        arrangement: 'force',
        // Longer links, more repulsion and more room around each node than the defaults open up
        // the dense middle of the graph; `linlog` belongs to ForceAtlas2 and tightens its clusters.
        force: {
          algorithm: 'spring',
          linkdistance: 40,
          charge: -160,
          collidepadding: 6,
          linlog: true,
        },
        node: {
          label: g.label,
          group: g.group,
          sizeby: 'indegree',
          sizerange: [6, 30],
          textfont: { size: narrow ? 8 : 10 },
          hovertemplate:
            '<b>%{label}.ts</b><br>imported by %{indegree} modules<br>imports %{outdegree}' +
            '<extra>%{group}/</extra>',
        },
        link: {
          source: g.source,
          target: g.target,
          width: 0.75,
          hovertemplate: '%{source.label} imports %{target.label}<extra></extra>',
        },
      },
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : `packages/${PACKAGE}: ${g.label.length} modules and ${g.source.length} imports; ` +
            `${top.importers} modules import ${top.label}.ts`,
      },
      legend: narrow
        ? { orientation: 'h', x: 0, y: 0, yanchor: 'top' }
        : { title: { text: 'Directory' }, font: { color: LOOK.text } },
      margin: { l: 12, r: 12, t: narrow ? 12 : 56, b: 12 },
    },
    config: chartConfig(narrow),
  });

  segmented(
    toolbar,
    'Layout',
    [
      { value: 'spring', text: 'Springs' },
      { value: 'forceatlas2', text: 'ForceAtlas2' },
    ],
    (value) => void chart.restyle({ 'force.algorithm': value }),
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
