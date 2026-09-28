import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { chartExample, STORE } from '../_lib/hierarchy.ts';

/**
 * Label positions (plan E13.3): `textposition` places labels in their tiles — here
 * `'middle center'` and `'bottom right'` (headers move to a bottom band). Labels show the
 * category, its sales and its share of the department; ones too wide for their tile wrap at spaces
 * before they shrink.
 */
export const meta: ExampleMeta = {
  title: 'Treemap: text positions',
  description:
    'Labels centered in their tiles, or in the bottom-right corner with headers below, wrapped and shrunk to fit.',
  tags: ['treemap', 'hierarchical', 'chart', 'text'],
  size: { width: 760, height: 440 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  return chartExample(el, () => ({
    data: [
      {
        type: 'treemap',
        ...STORE,
        textinfo: 'label+value+percent parent',
        textposition: 'middle center',
        domain: { x: [0, 0.49] },
      },
      {
        type: 'treemap',
        ...STORE,
        textinfo: 'label+value+percent parent',
        textposition: 'bottom right',
        domain: { x: [0.51, 1] },
      },
    ],
    layout: { margin: { l: 20, r: 20, t: 50, b: 20 } },
    config: { responsive: true },
  }));
}
