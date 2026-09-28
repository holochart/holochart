import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { chartExample, STORE } from '../_lib/hierarchy.ts';

/**
 * Icicle with a colorscale (plan E13.4): cells colored by their own sales through
 * `marker.colorscale` (departments carry no sales of their own, so they take the low end), with a
 * colorbar, hatched departments (`marker.pattern`) and each cell's share of the store.
 */
export const meta: ExampleMeta = {
  title: 'Icicle: colorscale',
  description: 'Cells colored by value through a colorscale with a colorbar, departments hatched.',
  tags: ['icicle', 'hierarchical', 'chart', 'colorscale', 'colorbar', 'pattern'],
  size: { width: 720, height: 420 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  return chartExample(el, () => ({
    data: [
      {
        type: 'icicle',
        ...STORE,
        textinfo: 'label+percent root',
        marker: {
          colors: STORE.values,
          colorscale: 'Blues',
          showscale: true,
          pattern: { shape: STORE.values.map((v, i) => (i > 0 && v === 0 ? '/' : '')), size: 6 },
        },
      },
    ],
    layout: { title: { text: 'Store sales' }, margin: { l: 20, r: 20, t: 50, b: 20 } },
    config: { responsive: true },
  }));
}
