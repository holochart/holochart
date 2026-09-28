import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { chartExample, EVE } from '../_lib/hierarchy.ts';

/**
 * Flipped icicles (plan E13.4): `tiling.flip` mirrors the layout, moving the root to the other
 * side — on the right of a horizontal icicle (`flip: 'x'`), at the bottom of a vertical one
 * (`flip: 'y'`).
 */
export const meta: ExampleMeta = {
  title: 'Icicle: flipped',
  description: 'The root on the right of a horizontal icicle and at the bottom of a vertical one.',
  tags: ['icicle', 'hierarchical', 'chart', 'orientation'],
  size: { width: 760, height: 400 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  return chartExample(el, () => ({
    data: [
      { type: 'icicle', ...EVE, tiling: { flip: 'x' }, domain: { x: [0, 0.48] } },
      {
        type: 'icicle',
        ...EVE,
        tiling: { orientation: 'v', flip: 'y' },
        textposition: 'bottom left',
        domain: { x: [0.52, 1] },
      },
    ],
    layout: { margin: { l: 20, r: 20, t: 30, b: 20 } },
    config: { responsive: true },
  }));
}
