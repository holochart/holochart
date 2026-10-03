import { createChart, type Chart, type SunburstTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { CATEGORIES, CATEGORY_COLOR, ELEMENTS } from './data.mts';
import { kindOf, KINDS, type Kind } from './elements.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The family tree of the 118 elements as a `sunburst`: "Elements" in the center, then metal,
 * metalloid or nonmetal (halogens and noble gases count as nonmetals), then the ten categories,
 * then every element as one sector labelled with its symbol. Every element counts 1
 * (`branchvalues: 'total'`, with the totals of the inner rings summed up here), sectors keep the
 * order of the data (`sort: false`, elements by atomic number), colors come from `marker.colors`,
 * labels that do not fit are hidden (`uniformtext`) and hover gives the name, the atomic number
 * and the size of each family (`customdata`). Click a sector to zoom into its family.
 *
 * About four out of five elements are metals.
 */
export const meta: ExampleMeta = {
  title: 'Elements: families of the periodic table',
  description:
    'A sunburst of all 118 elements: metal, metalloid or nonmetal, then the ten categories, then each element.',
  tags: ['demo', 'sunburst', 'hierarchical', 'branchvalues', 'uniformtext', 'hover'],
  size: { width: 720, height: 560 },
  testTolerance: 0.004,
};

/** Neutral shades for the ring of kinds, so the category colors stand out. */
const KIND_COLOR: Record<Kind, string> = {
  Metal: '#3a3d52',
  Metalloid: '#2a4a46',
  Nonmetal: '#2f4a33',
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const ids: string[] = [];
  const labels: string[] = [];
  const parents: string[] = [];
  const values: number[] = [];
  const colors: string[] = [];
  const hover: string[] = [];
  const add = (
    id: string,
    label: string,
    parent: string,
    value: number,
    color: string,
    note: string,
  ): void => {
    ids.push(id);
    labels.push(label);
    parents.push(parent);
    values.push(value);
    colors.push(color);
    hover.push(note);
  };
  const total = ELEMENTS.length;
  const share = (n: number): string => `${n} elements, ${Math.round((n / total) * 100)}% of all`;

  add('all', 'Elements', '', total, LOOK.grid, `<b>All elements</b><br>${total} elements`);
  for (const kind of KINDS) {
    const ofKind = ELEMENTS.filter((e) => kindOf(e) === kind);
    add(
      `kind-${kind}`,
      `${kind}s`,
      'all',
      ofKind.length,
      KIND_COLOR[kind],
      `<b>${kind}s</b><br>${share(ofKind.length)}`,
    );
    for (const category of CATEGORIES) {
      const es = ofKind.filter((e) => e.category === category);
      if (es.length === 0) continue;
      add(
        `cat-${category}`,
        `${category}s`.replace('gass', 'gases'),
        `kind-${kind}`,
        es.length,
        CATEGORY_COLOR[category],
        `<b>${category}s</b><br>${share(es.length)}`.replace('gass', 'gases'),
      );
      for (const e of es) {
        add(
          `el-${e.symbol}`,
          e.symbol,
          `cat-${category}`,
          1,
          CATEGORY_COLOR[category],
          `<b>${e.name}</b> (${e.symbol})<br>atomic number ${e.z}<br>${category.toLowerCase()}`,
        );
      }
    }
  }

  const trace: SunburstTrace = {
    type: 'sunburst',
    name: 'Elements',
    ids,
    labels,
    parents,
    values,
    customdata: hover,
    branchvalues: 'total',
    sort: false,
    marker: { colors, line: { color: LOOK.bg, width: 1 } },
    leaf: { opacity: 0.75 },
    insidetextorientation: 'radial',
    textinfo: 'label',
    insidetextfont: { color: LOOK.title },
    outsidetextfont: { color: LOOK.title, size: 13 },
    hovertemplate: '%{customdata}<extra></extra>',
  };

  const metals = ELEMENTS.filter((e) => kindOf(e) === 'Metal').length;
  const chart: Chart = createChart(chartEl, {
    data: [trace],
    layout: {
      title: { text: narrow ? '' : `Families of the elements: ${metals} of ${total} are metals` },
      margin: { t: narrow ? 8 : 48, l: 8, r: 8, b: 8 },
      uniformtext: { minsize: narrow ? 5 : 7, mode: 'hide' },
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
