import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { chartExample, EVE } from '../_lib/hierarchy.ts';

/**
 * A 3D treemap (plan E8.9): with `depth` every tile is a prism standing on its parent's top, so
 * the hierarchy rises in terraces, one per level; `tilt` lays it back. Labels sit on the tiles'
 * tops, and the outlines become gaps between the tiles. Clicking a tile still drills down (the
 * tiles glide to their new places, in 3D).
 */
export const meta: ExampleMeta = {
  title: 'Treemap: 3D terraces (depth, tilt)',
  description: "Plotly's Eve family tree as tiles stacked by level, tilted back.",
  tags: ['treemap', 'hierarchical', 'chart', 'depth', '2.5d', '3d-native', 'holochart-extension'],
  size: { width: 640, height: 420 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  return chartExample(el, () => ({
    data: [{ type: 'treemap', ...EVE, depth: 8, tilt: 26, bevel: { size: 2 } }],
    layout: { title: { text: 'The family of Eve' }, margin: { l: 20, r: 20, t: 50, b: 20 } },
    config: { responsive: true },
  }));
}
