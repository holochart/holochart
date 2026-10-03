import { createChart, type Chart, type IcicleTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * How chemists sort matter, as an `icicle` read from the top down (`tiling.orientation: 'v'`):
 * matter is either a pure substance (an element or a compound) or a mixture (the same throughout,
 * or with parts you can see), with three everyday examples under each. Every example has the
 * same value, so the four kinds get equal widths (`branchvalues: 'total'`); each top branch has
 * one hue, lighter towards the leaves (`marker.colors`). Each box explains its word in plain
 * terms (`text`), and hover repeats it.
 */
export const meta: ExampleMeta = {
  title: 'Matter: how it is classified',
  description:
    'An icicle chart sorting matter into pure substances (elements, compounds) and mixtures (homogeneous, heterogeneous), with examples.',
  tags: ['demo', 'icicle', 'hierarchy', 'chemistry'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

interface Node {
  id: string;
  parent: string;
  label: string;
  /** Plain-words explanation shown under the label. */
  note: string;
  color: string;
}

const PURE = ['#5e74d5', '#4a5cab', '#3d4c8d'] as const;
const MIX = ['#cc540a', '#a3460c', '#863b0d'] as const;

const NODES: readonly Node[] = [
  {
    id: 'matter',
    parent: '',
    label: 'Matter',
    note: 'anything that has mass and takes up space',
    color: LOOK.zero,
  },
  {
    id: 'pure',
    parent: 'matter',
    label: 'Pure substance',
    note: 'one kind of particle only',
    color: PURE[0],
  },
  {
    id: 'mix',
    parent: 'matter',
    label: 'Mixture',
    note: 'two or more substances, not chemically joined',
    color: MIX[0],
  },
  { id: 'element', parent: 'pure', label: 'Element', note: 'one kind of atom', color: PURE[1] },
  {
    id: 'compound',
    parent: 'pure',
    label: 'Compound',
    note: 'different atoms bonded together',
    color: PURE[1],
  },
  {
    id: 'homo',
    parent: 'mix',
    label: 'Homogeneous',
    note: 'looks the same throughout',
    color: MIX[1],
  },
  {
    id: 'hetero',
    parent: 'mix',
    label: 'Heterogeneous',
    note: 'you can see the separate parts',
    color: MIX[1],
  },
  { id: 'gold', parent: 'element', label: 'Gold', note: 'Au', color: PURE[2] },
  { id: 'oxygen', parent: 'element', label: 'Oxygen', note: 'O<sub>2</sub>', color: PURE[2] },
  { id: 'carbon', parent: 'element', label: 'Carbon', note: 'C', color: PURE[2] },
  { id: 'water', parent: 'compound', label: 'Water', note: 'H<sub>2</sub>O', color: PURE[2] },
  { id: 'salt', parent: 'compound', label: 'Salt', note: 'NaCl', color: PURE[2] },
  {
    id: 'co2',
    parent: 'compound',
    label: 'Carbon dioxide',
    note: 'CO<sub>2</sub>',
    color: PURE[2],
  },
  { id: 'air', parent: 'homo', label: 'Air', note: 'gases', color: MIX[2] },
  { id: 'sea', parent: 'homo', label: 'Sea water', note: 'salt in water', color: MIX[2] },
  { id: 'brass', parent: 'homo', label: 'Brass', note: 'copper and zinc', color: MIX[2] },
  { id: 'sand', parent: 'hetero', label: 'Sand in water', note: 'settles out', color: MIX[2] },
  { id: 'granite', parent: 'hetero', label: 'Granite', note: 'visible grains', color: MIX[2] },
  { id: 'salad', parent: 'hetero', label: 'Salad', note: 'pick it apart', color: MIX[2] },
];

/** Number of leaves under a node (each leaf counts 1). */
function leaves(id: string): number {
  const kids = NODES.filter((n) => n.parent === id);
  return kids.length === 0 ? 1 : kids.reduce((a, k) => a + leaves(k.id), 0);
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const trace: IcicleTrace = {
    type: 'icicle',
    ids: NODES.map((n) => n.id),
    labels: NODES.map((n) => n.label),
    parents: NODES.map((n) => n.parent),
    values: NODES.map((n) => leaves(n.id)),
    branchvalues: 'total',
    sort: false,
    text: NODES.map((n) =>
      narrow && leaves(n.id) === 1 ? n.label : `<b>${n.label}</b><br>${n.note}`,
    ),
    customdata: NODES.map((n) => n.note),
    textinfo: 'text',
    textposition: 'middle center',
    tiling: { orientation: 'v', pad: 2 },
    marker: { colors: NODES.map((n) => n.color), line: { color: LOOK.bg, width: 1 } },
    insidetextfont: { color: LOOK.title, size: narrow ? 9 : 12 },
    hovertemplate: '<b>%{label}</b><br>%{customdata}<extra></extra>',
  };

  const chart: Chart = createChart(chartEl, {
    data: [trace],
    layout: {
      title: { text: narrow ? '' : 'Sorting matter: is it one substance, or several mixed?' },
      margin: narrow ? { t: 8, l: 4, r: 4, b: 4 } : { l: 10, r: 10, b: 10 },
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
