import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { chartExample } from '../_lib/hierarchy.ts';

/**
 * A 3D pie (plan E9.12): `depth` gives the pie a thickness, `tilt` looks at it from above (the
 * trace's own view, with `perspective`), and the slices stay lit so their tops show their exact
 * colors while the sides shade darker. Labels sit on the slices' tops; `marker.line` becomes a gap
 * of its width between the slices. Hover and click work on the tilted slices.
 */
export const meta: ExampleMeta = {
  title: 'Pie: 3D pie (depth, tilt)',
  description: 'A pie with a thickness, tilted back, with gaps between the slices.',
  tags: ['pie', 'chart', 'depth', '2.5d', '3d-native', 'holochart-extension'],
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  return chartExample(el, () => ({
    data: [
      {
        type: 'pie',
        name: 'Budget',
        labels: ['Housing', 'Food', 'Transport', 'Savings', 'Leisure', 'Other'],
        values: [1450, 620, 380, 540, 310, 150],
        depth: 36,
        tilt: 50,
        marker: { line: { width: 2 } },
      },
    ],
    layout: { title: { text: 'Monthly budget' } },
    config: { responsive: true },
  }));
}
