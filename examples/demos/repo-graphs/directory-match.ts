import { createChart, type Chart, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { directoryMatches, percent } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * How well each package's directories match the structure of its imports, as a dumbbell per
 * package: the modularity of the partition into directories (circle) and of the communities
 * `louvain` finds (diamond), both computed with `modularity` of the graph package. Modularity is
 * the share of imports that stay inside a group, minus what a random graph with the same degrees
 * would have: a short bar means the folders are close to the best grouping the imports allow,
 * and a circle at or below zero means the folders cut across the imports.
 *
 * Plain `scatter` traces: the measures of the graph package are pure functions, and what they
 * return can be drawn by any chart.
 */
export const meta: ExampleMeta = {
  title: 'This repository: directories against import communities, per package',
  description:
    'Modularity of each package’s directory structure against the Louvain communities of its imports, as a dumbbell chart.',
  tags: ['demo', 'scatter', 'dumbbell', 'louvain', 'modularity', 'network'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

/** Packages with fewer modules than this have too few imports for the comparison to mean much. */
const MIN_MODULES = 20;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const rows = directoryMatches(MIN_MODULES).sort(
    (a, b) => a.modularityOfDirectories - b.modularityOfDirectories,
  );

  const hover = rows.map(
    (r) =>
      `<b>${r.dir}</b>: ${r.modules} modules<br>` +
      `${r.directories} directories, modularity ${r.modularityOfDirectories.toFixed(2)}<br>` +
      `${r.communities} communities, modularity ${r.modularityOfCommunities.toFixed(2)}<br>` +
      `${percent(r.share)} of the modules are where most of their directory is`,
  );
  const bars = rows.map((r): ScatterTrace => ({
    type: 'scatter',
    mode: 'lines',
    x: [r.modularityOfDirectories, r.modularityOfCommunities],
    y: [r.dir, r.dir],
    line: { color: LOOK.zero, width: 3 },
    hoverinfo: 'skip',
    showlegend: false,
  }));
  const dots = (name: string, x: number[], color: string, symbol: string): ScatterTrace => ({
    type: 'scatter',
    mode: 'markers',
    name,
    x,
    y: rows.map((r) => r.dir),
    marker: { color, symbol, size: 11 },
    customdata: hover,
    hovertemplate: '%{customdata}<extra></extra>',
  });

  const chart: Chart = createChart(chartEl, {
    data: [
      ...bars,
      dots(
        'Directories',
        rows.map((r) => r.modularityOfDirectories),
        LOOK.colorway[1],
        'circle',
      ),
      dots(
        'Louvain communities',
        rows.map((r) => r.modularityOfCommunities),
        LOOK.colorway[4],
        'diamond',
      ),
    ],
    layout: {
      title: { text: narrow ? '' : 'Modularity of the directories and of the import communities' },
      hovermode: 'closest',
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: { title: { text: 'Modularity' }, zeroline: true },
      yaxis: { type: 'category', automargin: true },
      margin: { l: 110, r: 24, t: narrow ? 40 : 84, b: 56 },
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
