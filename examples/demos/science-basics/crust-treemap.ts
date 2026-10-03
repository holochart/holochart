import { createChart, type Chart, type TreemapTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { ELEMENT_COLOR, ELEMENT_NAME, inkOn, type ElementSymbol } from './matter.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The Earth's crust by mass as a `treemap`: one tile per element, with area in proportion to its
 * share, grouped into nonmetals (oxygen), metalloids (silicon) and metals (`parents`,
 * `branchvalues: 'total'`). Tile text gives the symbol, name and percent (`text`), tiles too small
 * for it stay blank (`uniformtext`), and each element has the color it has in the composition
 * donuts. Oxygen and silicon, the two ingredients of sand and most rock, are three quarters of the
 * crust; the metals we build with are a small corner.
 */
export const meta: ExampleMeta = {
  title: 'Composition: the Earth’s crust as a treemap',
  description:
    'A treemap of the elements in the Earth’s crust by mass, grouped into nonmetals, metalloids and metals.',
  tags: ['demo', 'treemap', 'hierarchy', 'chemistry'],
  size: { width: 960, height: 480 },
  testTolerance: 0.004,
};

const GROUPS: readonly { name: string; parts: readonly (readonly [ElementSymbol, number])[] }[] = [
  { name: 'Nonmetals', parts: [['O', 46.1]] },
  { name: 'Metalloids', parts: [['Si', 28.2]] },
  {
    name: 'Metals',
    parts: [
      ['Al', 8.2],
      ['Fe', 5.6],
      ['Ca', 4.2],
      ['Na', 2.4],
      ['Mg', 2.3],
      ['K', 2.1],
      ['Ti', 0.57],
    ],
  },
];

const round2 = (v: number): number => Math.round(v * 100) / 100;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const ids: string[] = ['crust'];
  const labels: string[] = ['Earth’s crust, percent of its mass'];
  const parents: string[] = [''];
  const values: number[] = [100];
  const text: string[] = [''];
  const colors: string[] = [LOOK.bg];
  const ink: string[] = [LOOK.title];
  let named = 0;
  for (const g of GROUPS) {
    const sum = round2(g.parts.reduce((a, [, v]) => a + v, 0));
    named += sum;
    ids.push(g.name);
    labels.push(`${g.name} ${sum}%`);
    parents.push('crust');
    values.push(sum);
    text.push('');
    colors.push(LOOK.grid);
    ink.push(LOOK.title);
    for (const [s, v] of g.parts) {
      ids.push(s);
      labels.push(ELEMENT_NAME[s]);
      parents.push(g.name);
      values.push(v);
      text.push(`<b>${s}</b><br>${ELEMENT_NAME[s]}<br>${v}%`);
      colors.push(ELEMENT_COLOR[s]);
      ink.push(inkOn(s));
    }
  }
  // Every other element together: what is left of 100%.
  const rest = round2(100 - named);
  ids.push('rest');
  labels.push('Everything else');
  parents.push('crust');
  values.push(rest);
  text.push(`Everything else<br>${rest}%`);
  colors.push(ELEMENT_COLOR.other);
  ink.push(LOOK.title);

  const trace: TreemapTrace = {
    type: 'treemap',
    ids,
    labels,
    parents,
    values,
    text,
    branchvalues: 'total',
    textinfo: 'text',
    textposition: 'middle center',
    textfont: { size: narrow ? 10 : 13, color: ink },
    marker: {
      colors,
      line: { color: LOOK.bg, width: 1 },
      pad: { t: 22, l: 3, r: 3, b: 3 },
    },
    tiling: { pad: 2 },
    hovertemplate: '<b>%{label}</b><br>%{value}% of the crust by mass<extra></extra>',
  };

  const chart: Chart = createChart(chartEl, {
    data: [trace],
    layout: {
      title: { text: narrow ? '' : 'The ground under your feet is mostly oxygen and silicon' },
      margin: narrow ? { t: 8, l: 4, r: 4, b: 4 } : { l: 10, r: 10, b: 10 },
      uniformtext: { minsize: 8, mode: 'hide' },
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
