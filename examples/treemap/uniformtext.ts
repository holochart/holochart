import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { chartExample, STORE } from '../_lib/hierarchy.ts';

/**
 * Uniform text (plan E4.6, E13.3): `layout.uniformtext` sizes every tile label, headers included,
 * alike: the size of the smallest label that still fits its tile, as in Plotly. Labels that would
 * have to shrink below `minsize` (11 px) are hidden (`mode: 'hide'`), so small tiles stay clean
 * while the rest read at one size.
 */
export const meta: ExampleMeta = {
  title: 'Treemap: uniform text',
  description:
    "A store's sales by department and category with every tile label at one size; labels under 11 px are hidden.",
  tags: ['treemap', 'hierarchical', 'chart', 'text', 'uniformtext'],
  size: { width: 640, height: 420 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  return chartExample(el, () => ({
    data: [{ type: 'treemap', ...STORE, textinfo: 'label+value', textfont: { size: 16 } }],
    layout: {
      title: { text: 'Sales by department' },
      uniformtext: { mode: 'hide', minsize: 11 },
      margin: { l: 20, r: 20, t: 50, b: 20 },
    },
    config: { responsive: true },
  }));
}
