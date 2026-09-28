import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { chartExample, STORE } from '../_lib/hierarchy.ts';

/**
 * Every tiling (plan E13.3): the same store sales laid out by each `tiling.packing` — `squarify`
 * (the default, tiles close to square), `binary` (balanced splits), `dice` (side by side), `slice`
 * (stacked), `slice-dice` and `dice-slice` (alternating by level) — in a 3 × 2 grid of domains.
 */
export const meta: ExampleMeta = {
  title: 'Treemap: tilings',
  description:
    'The same hierarchy laid out by each packing: squarify, binary, dice, slice, slice-dice and dice-slice.',
  tags: ['treemap', 'hierarchical', 'chart', 'tiling'],
  size: { width: 780, height: 520 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

const PACKINGS = ['squarify', 'binary', 'dice', 'slice', 'slice-dice', 'dice-slice'] as const;

export function run(el: HTMLElement): ExampleHandle {
  return chartExample(el, () => ({
    data: PACKINGS.map((packing, k) => ({
      type: 'treemap' as const,
      name: packing,
      ...STORE,
      tiling: { packing, pad: 2 },
      marker: { pad: { t: 16, l: 3, r: 3, b: 3 } },
      textfont: { size: 10 },
      pathbar: { visible: false },
      domain: { row: Math.floor(k / 3), column: k % 3 },
    })),
    layout: {
      grid: { rows: 2, columns: 3, xgap: 0.04, ygap: 0.16 },
      annotations: PACKINGS.map((packing, k) => ({
        text: packing,
        showarrow: false,
        xref: 'paper' as const,
        yref: 'paper' as const,
        x: (k % 3) / 2,
        xanchor: (['left', 'center', 'right'] as const)[k % 3],
        y: k < 3 ? 1.02 : 0.44,
        yanchor: 'bottom' as const,
      })),
      margin: { l: 16, r: 16, t: 44, b: 16 },
    },
    config: { responsive: true },
  }));
}
