import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { chartExample, STORE } from '../_lib/hierarchy.ts';

/**
 * Uniform text (plan E4.6, E13.2): `layout.uniformtext` draws every sector label at one size, the
 * size of the smallest label that still fits, as in Plotly. With `mode: 'hide'` and `minsize: 10`,
 * labels that would have to shrink below 10 px to fit their sector are hidden instead, so the
 * outer ring reads at a single size rather than tapering off into specks.
 */
export const meta: ExampleMeta = {
  title: 'Sunburst: uniform text',
  description:
    "A store's sales by department and category with every label at one size; labels under 10 px are hidden.",
  tags: ['sunburst', 'hierarchical', 'chart', 'text', 'uniformtext'],
  size: { width: 560, height: 480 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  return chartExample(el, () => ({
    data: [{ type: 'sunburst', ...STORE, textinfo: 'label+percent entry' }],
    layout: {
      title: { text: 'Sales by department' },
      uniformtext: { mode: 'hide', minsize: 10 },
      margin: { l: 20, r: 20, t: 50, b: 20 },
    },
    config: { responsive: true },
  }));
}
