import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { chartExample, STORE } from '../_lib/hierarchy.ts';

/**
 * Vertical icicle (plan E13.4): `tiling.orientation: 'v'` stacks the levels from the top down —
 * store, departments, categories — each cell as wide as its sales, with `tiling.pad` gaps and
 * labels (with the share of the parent) centered in their cells.
 */
export const meta: ExampleMeta = {
  title: 'Icicle: vertical',
  description:
    'Levels stacked from the top down, cells as wide as their values, with gaps between them.',
  tags: ['icicle', 'hierarchical', 'chart', 'orientation'],
  size: { width: 760, height: 400 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  return chartExample(el, () => ({
    data: [
      {
        type: 'icicle',
        ...STORE,
        tiling: { orientation: 'v', pad: 2 },
        textposition: 'middle center',
        textinfo: 'label+percent parent',
        leaf: { opacity: 1 },
      },
    ],
    layout: { title: { text: 'Store sales' }, margin: { l: 20, r: 20, t: 50, b: 20 } },
    config: { responsive: true },
  }));
}
