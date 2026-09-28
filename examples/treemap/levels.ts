import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { chartExample, STORE } from '../_lib/hierarchy.ts';

/**
 * Levels (plan E13.3): `maxdepth: 2` draws the store and its departments only (the categories
 * appear when you drill into a department), and `level` starts the second treemap inside
 * Grocery, with the path bar above it leading back up.
 */
export const meta: ExampleMeta = {
  title: 'Treemap: levels and depth',
  description:
    'Two levels at a time with maxdepth, and a treemap that starts inside a branch with level, its path bar leading back up.',
  tags: ['treemap', 'hierarchical', 'chart', 'levels'],
  size: { width: 760, height: 420 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  return chartExample(el, () => ({
    data: [
      {
        type: 'treemap',
        ...STORE,
        maxdepth: 2,
        textinfo: 'label+percent root',
        domain: { x: [0, 0.48] },
      },
      {
        type: 'treemap',
        ...STORE,
        level: 'Grocery',
        textinfo: 'label+percent root',
        domain: { x: [0.52, 1] },
      },
    ],
    layout: { margin: { l: 20, r: 20, t: 60, b: 20 } },
    config: { responsive: true },
  }));
}
