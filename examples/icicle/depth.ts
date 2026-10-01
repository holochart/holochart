import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { chartExample, STORE } from '../_lib/hierarchy.ts';

/**
 * A 3D icicle (plan E8.9): `depth` extrudes every cell, `bevel` rounds its edges and `tilt` lays
 * the chart back; here the rows run top-down (`tiling.orientation: 'v'`) and deeper levels are
 * taller (`depth` per node). Clicking a cell still drills down, animated.
 */
export const meta: ExampleMeta = {
  title: 'Icicle: 3D cells (depth, bevel, tilt)',
  description: "A store's sales as rows of extruded cells, deeper levels taller, tilted back.",
  tags: [
    'icicle',
    'hierarchical',
    'chart',
    'depth',
    'bevel',
    '2.5d',
    '3d-native',
    'holochart-extension',
  ],
  size: { width: 640, height: 420 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  // Per node: the root 6 px, departments 14 px, categories 24 px.
  const depth = STORE.parents.map((parent) => (parent === '' ? 6 : parent === 'Store' ? 14 : 24));
  return chartExample(el, () => ({
    data: [
      {
        type: 'icicle',
        ...STORE,
        tiling: { orientation: 'v' },
        depth,
        bevel: { size: 3 },
        tilt: 40,
        marker: { line: { width: 2 } },
      },
    ],
    layout: { title: { text: 'Sales by department' }, margin: { l: 20, r: 20, t: 50, b: 20 } },
    config: { responsive: true },
  }));
}
