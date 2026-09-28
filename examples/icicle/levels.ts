import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { chartExample, STORE } from '../_lib/hierarchy.ts';

/**
 * Levels (plan E13.4): `maxdepth: 2` fills the icicle with two levels (the categories appear when
 * you drill in), and `level` starts the second icicle at Electronics, its path bar (`side:
 * 'bottom'`) leading back up to the store.
 */
export const meta: ExampleMeta = {
  title: 'Icicle: levels and path bar',
  description:
    'Two levels at a time with maxdepth, and an icicle that starts inside a branch, its path bar below it.',
  tags: ['icicle', 'hierarchical', 'chart', 'levels', 'pathbar'],
  size: { width: 760, height: 420 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  return chartExample(el, () => ({
    data: [
      { type: 'icicle', ...STORE, maxdepth: 2, domain: { x: [0, 0.48] } },
      {
        type: 'icicle',
        ...STORE,
        level: 'Electronics',
        pathbar: { side: 'bottom' },
        textinfo: 'label+percent entry',
        domain: { x: [0.52, 1] },
      },
    ],
    layout: { margin: { l: 20, r: 20, t: 30, b: 40 } },
    config: { responsive: true },
  }));
}
