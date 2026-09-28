import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { chartExample, STORE } from '../_lib/hierarchy.ts';

/**
 * Depth fade and colorscales (plan E13.3): on the left, `marker.depthfade: 'reversed'` keeps the
 * branches saturated and fades the leaves towards the background; on the right the tiles are
 * colored by their sales through `marker.colorscale` (depth fade is off with a colorscale), with
 * a colorbar.
 */
export const meta: ExampleMeta = {
  title: 'Treemap: depth fade and colorscale',
  description:
    "Leaves faded towards the background with depthfade: 'reversed', next to tiles colored by value through a colorscale.",
  tags: ['treemap', 'hierarchical', 'chart', 'colorscale', 'colorbar'],
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
        marker: { depthfade: 'reversed' },
        domain: { x: [0, 0.45] },
      },
      {
        type: 'treemap',
        ...STORE,
        marker: { colors: STORE.values, colorscale: 'Viridis', showscale: true },
        domain: { x: [0.5, 0.95] },
      },
    ],
    layout: { margin: { l: 20, r: 20, t: 50, b: 20 } },
    config: { responsive: true },
  }));
}
