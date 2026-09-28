import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { chartExample, STORE } from '../_lib/hierarchy.ts';

/**
 * Padding and rounded corners (plan E13.3): `tiling.pad` spaces sibling tiles, `marker.pad` sets
 * the room around each branch's children (the top one holds its header), and
 * `marker.cornerradius` rounds the tiles — never more than the padding on the label side.
 */
export const meta: ExampleMeta = {
  title: 'Treemap: padding and corners',
  description:
    'Wider gaps between tiles, roomy branch headers and rounded corners through tiling.pad, marker.pad and marker.cornerradius.',
  tags: ['treemap', 'hierarchical', 'chart', 'style'],
  size: { width: 640, height: 440 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  return chartExample(el, () => ({
    data: [
      {
        type: 'treemap',
        ...STORE,
        tiling: { pad: 6 },
        marker: { pad: { t: 28, l: 8, r: 8, b: 8 }, cornerradius: 8, line: { width: 0 } },
        textinfo: 'label+value',
      },
    ],
    layout: { title: { text: 'Store sales' }, margin: { l: 20, r: 20, t: 70, b: 20 } },
    config: { responsive: true },
  }));
}
