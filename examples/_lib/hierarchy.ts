import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle } from './types.ts';

/** Glyphs of the hierarchy examples' labels, preloaded so they render in one go. */
const CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,%&/-:$()';

/**
 * Run a figure once the label font is ready (the treemap and icicle examples' shell): the handle
 * resolves when the chart and its components have rendered.
 */
export function chartExample(el: HTMLElement, figure: () => Parameters<typeof createChart>[1]) {
  let chart: Chart | undefined;
  let disposed = false;
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, figure());
    await componentsReady(chart);
  });
  const handle: ExampleHandle = {
    ready,
    get renderer() {
      return chart?.three.renderer;
    },
    dispose: () => {
      disposed = true;
      chart?.destroy();
    },
  };
  return handle;
}

/**
 * A small store's sales by department and category (made-up, fixed numbers): `ids` are paths,
 * labels repeat across departments, and only the categories carry values.
 */
export const STORE = (() => {
  const departments: [string, [string, number][]][] = [
    [
      'Grocery',
      [
        ['Fresh produce', 420],
        ['Bakery', 180],
        ['Dairy', 260],
        ['Frozen', 150],
        ['Snacks', 120],
      ],
    ],
    [
      'Home',
      [
        ['Kitchen', 210],
        ['Furniture', 330],
        ['Garden', 140],
        ['Lighting', 70],
      ],
    ],
    [
      'Clothing',
      [
        ['Women', 290],
        ['Men', 190],
        ['Kids', 160],
        ['Shoes', 110],
      ],
    ],
    [
      'Electronics',
      [
        ['Phones', 240],
        ['Computers', 200],
        ['Audio', 90],
        ['Games', 80],
      ],
    ],
    [
      'Health',
      [
        ['Pharmacy', 130],
        ['Beauty', 100],
      ],
    ],
  ];
  const ids = ['Store'];
  const labels = ['Store'];
  const parents = [''];
  const values = [0];
  for (const [dept, categories] of departments) {
    ids.push(dept);
    labels.push(dept);
    parents.push('Store');
    values.push(0);
    for (const [category, value] of categories) {
      ids.push(`${dept}/${category}`);
      labels.push(category);
      parents.push(dept);
      values.push(value);
    }
  }
  return { ids, labels, parents, values };
})();

/** Plotly's "Eve" family tree (its sunburst and treemap docs' first example). */
export const EVE = {
  labels: ['Eve', 'Cain', 'Seth', 'Enos', 'Noam', 'Abel', 'Awan', 'Enoch', 'Azura'],
  parents: ['', 'Eve', 'Eve', 'Seth', 'Seth', 'Eve', 'Eve', 'Awan', 'Eve'],
  values: [10, 14, 12, 10, 2, 6, 6, 4, 4],
};
