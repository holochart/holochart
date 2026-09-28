import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { chartExample, STORE } from '../_lib/hierarchy.ts';

/**
 * Uniform text (plan E4.6, E13.4): with `layout.uniformtext`, every icicle cell label is drawn at
 * one size, the size of the smallest label that still fits its cell, as in Plotly. Labels that would
 * have to shrink below `minsize` (10 px) to fit are hidden (`mode: 'hide'`): the thin cells of the
 * small categories stay unlabeled instead of carrying unreadable text.
 */
export const meta: ExampleMeta = {
  title: 'Icicle: uniform text',
  description:
    "A store's sales by department and category as an icicle with every cell label at one size; labels under 10 px are hidden.",
  tags: ['icicle', 'hierarchical', 'chart', 'text', 'uniformtext'],
  size: { width: 640, height: 520 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  return chartExample(el, () => ({
    data: [{ type: 'icicle', ...STORE, textinfo: 'label' }],
    layout: {
      title: { text: 'Sales by department' },
      uniformtext: { mode: 'hide', minsize: 10 },
      margin: { l: 20, r: 20, t: 50, b: 20 },
    },
    config: { responsive: true },
  }));
}
