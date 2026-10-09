import { createChart, type Chart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { count, packageImports } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, packageColor, settled } from './ui.mts';

/**
 * Imports between the packages under `packages/`, as a `chord` diagram from a square `matrix`:
 * `matrix[a][b]` is the number of modules of package `a` that import package `b`. The chart is
 * `directed`, so every arc is as wide as what its package imports plus what imports it, and
 * `link.targetgap` holds the ribbons back from the arc they point at: a ribbon touches the
 * package that does the importing. Ribbons take the color of that package
 * (`link.colorsource: 'source'`), so the arcs of `core` and `render`, which import no other
 * package, are wide and have no ribbons of their own color. `node.group` puts the packages in
 * three groups with an outer ring.
 */
export const meta: ExampleMeta = {
  title: 'This repository: imports between packages',
  description:
    'A directed chord diagram of the imports between the 16 packages of the monorepo, from a matrix, grouped into foundations, traces and entry points.',
  tags: ['demo', 'chord', 'matrix', 'directed', 'groups', 'flow', 'dependencies'],
  size: { width: 760, height: 720 },
  testTolerance: 0.004,
};

/** The packages around the ring, by role, and the name of each group. */
const RING: readonly (readonly [string, string])[] = [
  ['core', 'Foundations'],
  ['render', 'Foundations'],
  ['runtime', 'Foundations'],
  ['components', 'Foundations'],
  ['traces-basic', 'Traces'],
  ['traces-stats', 'Traces'],
  ['traces-sci', 'Traces'],
  ['traces-finance', 'Traces'],
  ['traces-hier', 'Traces'],
  ['traces-3d', 'Traces'],
  ['traces-geo', 'Traces'],
  ['traces-graph', 'Traces'],
  ['holochart', 'Entry points'],
  ['express', 'Entry points'],
  ['themes', 'Entry points'],
  ['locales', 'Entry points'],
];

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const { labels, matrix, total } = packageImports();
  // The ring's order; a package that is not listed (a new one) goes last, in a group of its own.
  const ring = [
    ...RING,
    ...labels.filter((l) => !RING.some((r) => r[0] === l)).map((l) => [l, 'Other'] as const),
  ];
  const at = ring.map(([name]) => labels.indexOf(name)).filter((i) => i >= 0);
  const names = at.map((i) => labels[i]!);

  const chart: Chart = createChart(chartEl, {
    data: [
      {
        type: 'chord',
        matrix: at.map((a) => at.map((b) => matrix[a]![b]!)),
        labels: names,
        directed: true,
        valuesuffix: ' importing modules',
        textfont: { size: narrow ? 8 : 11, color: LOOK.title },
        node: {
          group: names.map((n) => ring.find((r) => r[0] === n)![1]),
          color: names.map(packageColor),
          hovertemplate:
            '<b>%{label}</b><br>imports other packages from %{out} modules<br>' +
            'imported by %{in} modules of other packages<extra></extra>',
        },
        link: {
          colorsource: 'source',
          opacity: 0.55,
          targetgap: 8,
          hovertemplate:
            '%{value} of <b>%{source.label}</b> import <b>%{target.label}</b><extra></extra>',
        },
        groups: { color: LOOK.zero, textfont: { size: narrow ? 9 : 11, color: LOOK.text } },
        showlegend: false,
      },
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : `${count(total)} imports from a module of one package to another package`,
      },
      margin: { l: 24, r: 24, t: narrow ? 16 : 64, b: 24 },
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
