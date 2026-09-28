import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { chartExample } from '../_lib/hierarchy.ts';

/**
 * Treemap with patterns (plan E13.3, E8.10): `marker.pattern.shape` per tile, one hatch per
 * branch and its children, drawn over the tile colors (`fillmode: 'overlay'`) in a contrasting
 * color; the root stays plain.
 */
export const meta: ExampleMeta = {
  title: 'Treemap: patterns',
  description: 'Each branch and its tiles hatched with their own pattern shape over their colors.',
  tags: ['treemap', 'hierarchical', 'chart', 'pattern'],
  size: { width: 640, height: 420 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  return chartExample(el, () => ({
    data: [
      {
        type: 'treemap',
        labels: [
          'Books',
          'Fiction',
          'Science',
          'History',
          'Novels',
          'Poetry',
          'Physics',
          'Biology',
          'Ancient',
          'Modern',
        ],
        parents: [
          '',
          'Books',
          'Books',
          'Books',
          'Fiction',
          'Fiction',
          'Science',
          'Science',
          'History',
          'History',
        ],
        values: [0, 0, 0, 0, 30, 10, 18, 14, 9, 15],
        marker: {
          pattern: {
            shape: ['', '/', '.', 'x', '/', '/', '.', '.', 'x', 'x'],
            fillmode: 'overlay',
            size: 8,
          },
        },
      },
    ],
    layout: { title: { text: 'Library shelves' }, margin: { l: 20, r: 20, t: 70, b: 20 } },
    config: { responsive: true },
  }));
}
