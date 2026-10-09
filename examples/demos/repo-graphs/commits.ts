import { createChart, type Chart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COMMIT_KIND_LABEL, COMMITS, commitGraph, commitStats, fmtDay } from './analysis.mts';
import { chartConfig, COMMIT_COLOR, frame, groupColorway, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The commit graph of this repository, drawn the way git tools draw it: one column per commit,
 * oldest on the left, and one row ("lane") per line of development, with the first-parent line of
 * `HEAD` at the top. The lanes are computed in the demo's analysis module by the rule
 * `git log --graph` follows, and the graph is drawn where they say: `arrangement: 'preset'`,
 * with `node.x` the commit's place in the history and `node.y` its lane. With `'preset'` the
 * positions are data on the trace's axes, so the x axis can be shown and carry the days as ticks
 * (`tickvals` at the first commit of each day).
 *
 * `node.group` is the kind of commit, read from the prefix of its subject line; merges are
 * diamonds (`node.symbol` takes one symbol per node). A link runs from every parent to its child,
 * so a merge has two coming in. Drag to zoom into a stretch of the history.
 */
export const meta: ExampleMeta = {
  title: 'This repository: the commit graph',
  description:
    'Every commit of the Holochart repository in lanes, as git tools draw them: preset positions, a day axis, commits colored by kind and merges as diamonds.',
  tags: ['demo', 'graph', 'network', 'preset', 'git', 'timeline', 'groups', 'symbols'],
  size: { width: 960, height: 340 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const g = commitGraph();
  const stats = commitStats();
  const kinds = COMMITS.map((c) => COMMIT_KIND_LABEL[c.kind]);
  const colorOf = new Map(COMMITS.map((c) => [COMMIT_KIND_LABEL[c.kind], COMMIT_COLOR[c.kind]]));

  // A tick at the first commit of every day (every other one where they would run together).
  const firstOfDay = COMMITS.map((c, i) => ({ c, i })).filter(
    ({ c, i }) => i === 0 || COMMITS[i - 1]!.day !== c.day,
  );
  const ticks = firstOfDay.filter(
    ({ i }, k) => k === 0 || i - firstOfDay[k - 1]!.i >= (narrow ? 14 : 5),
  );

  const chart: Chart = createChart(chartEl, {
    data: [
      {
        type: 'graph',
        arrangement: 'preset',
        node: {
          label: g.label,
          x: COMMITS.map((_, i) => i),
          y: COMMITS.map((c) => -c.lane),
          group: kinds,
          symbol: COMMITS.map((c) => (c.kind === 'merge' ? 'diamond' : 'circle')),
          size: COMMITS.map((c) => (c.kind === 'merge' ? 8 : 7)),
          textposition: 'none',
          customdata: COMMITS.map(
            (c) => `${c.subject}<br>${fmtDay(c.day, true)} · lane ${c.lane + 1}`,
          ),
          hovertemplate: '<b>%{label}</b> %{customdata}<extra>%{group}</extra>',
        },
        link: { source: g.source, target: g.target, width: 1.25, hoverinfo: 'skip' },
      },
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : `${stats.commits} commits, ${stats.merges} of them merges, in ${stats.lanes} lanes`,
      },
      colorway: groupColorway(kinds, (k) => colorOf.get(k) ?? LOOK.tick),
      legend: { orientation: 'h', x: 0, y: -0.16, yanchor: 'top' },
      xaxis: {
        visible: true,
        range: [-2, COMMITS.length + 1],
        tickvals: ticks.map(({ i }) => i),
        ticktext: ticks.map(({ c }) => fmtDay(c.day)),
        showgrid: true,
        zeroline: false,
        showline: false,
      },
      yaxis: { visible: false, range: [-(stats.lanes - 1) - 0.8, 0.8] },
      margin: { l: 16, r: 16, t: narrow ? 12 : 56, b: 72 },
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
