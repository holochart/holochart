import { createChart, type Chart, type ParcatsTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { CATEGORIES, ELEMENTS, STATE_COLOR, type State } from './data.mts';
import { kindOf, KINDS } from './elements.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * All 118 elements sorted three ways at once, as parallel categories (`parcats`): the broad kind
 * (metal, metalloid or nonmetal; halogens and noble gases count as nonmetals), the category, and
 * the state at room temperature. Each ribbon is a group of elements that share all three, as wide
 * as the number of elements in it. Ribbons are colored by state (`line.color` mapped through a
 * three-step `line.colorscale`), the axes keep a fixed order (`categoryarray`), and hover follows
 * the color (`hoveron: 'color'`), counting the elements of that state in a band.
 *
 * Most elements are solid metals. Only two are liquid at room temperature (mercury and bromine)
 * and the gases are all nonmetals. The states of the heaviest, short-lived elements are
 * predictions.
 */
export const meta: ExampleMeta = {
  title: 'Elements: kind, category and state at room temperature',
  description:
    'Parallel categories of all 118 elements: metal, metalloid or nonmetal, then category, then solid, liquid or gas.',
  tags: ['demo', 'parcats', 'categorical', 'colorscale', 'categoryarray', 'hover'],
  size: { width: 960, height: 520 },
  testTolerance: 0.004,
};

const STATES: readonly State[] = ['Solid', 'Liquid', 'Gas'];

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const count = (s: State): number => ELEMENTS.filter((e) => e.state === s).length;

  const trace: ParcatsTrace = {
    type: 'parcats',
    name: 'Elements',
    dimensions: [
      { label: 'Kind', values: ELEMENTS.map(kindOf), categoryarray: [...KINDS] },
      {
        label: 'Category',
        values: ELEMENTS.map((e) => e.category),
        categoryarray: [...CATEGORIES],
      },
      {
        label: 'State at room temperature',
        values: ELEMENTS.map((e) => e.state),
        categoryarray: [...STATES],
      },
    ],
    line: {
      color: ELEMENTS.map((e) => STATES.indexOf(e.state)),
      cmin: 0,
      cmax: 2,
      colorscale: [
        [0, STATE_COLOR.Solid],
        [0.5, STATE_COLOR.Liquid],
        [1, STATE_COLOR.Gas],
      ],
      shape: 'hspline',
    },
    hoveron: 'color',
    hoverinfo: 'count+probability',
    arrangement: 'freeform',
    labelfont: { size: narrow ? 10 : 12, color: LOOK.title },
    tickfont: { size: narrow ? 8 : 10, color: LOOK.title },
  };

  const chart: Chart = createChart(chartEl, {
    data: [trace],
    layout: {
      title: {
        text: narrow
          ? ''
          : `118 elements at room temperature: ${count('Solid')} solid, ${count('Gas')} gas, ${count('Liquid')} liquid`,
      },
      margin: { t: narrow ? 28 : 64, l: narrow ? 44 : 64, r: narrow ? 44 : 64, b: 24 },
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
