import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { chartExample, STORE } from '../_lib/hierarchy.ts';

/**
 * A "height" treemap (plan E8.9): `depth` takes one number per node, so a second measure — here
 * each category's margin — raises its tile while the areas keep showing the sales; departments
 * are thin plinths. A parallel projection (`perspective: 0`) keeps heights comparable across the
 * chart.
 */
export const meta: ExampleMeta = {
  title: 'Treemap: height-encoded tiles (per-node depth)',
  description: "A store's sales as tiles, each category raised by its margin.",
  tags: ['treemap', 'hierarchical', 'chart', 'depth', '2.5d', '3d-native', 'holochart-extension'],
  size: { width: 640, height: 420 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  // Made-up margins per node (px of height): the store and its departments get thin plinths.
  const depth = STORE.parents.map((parent, i) =>
    parent === '' || parent === 'Store' ? 2 : 4 + ((i * 7) % 13),
  );
  return chartExample(el, () => ({
    data: [
      {
        type: 'treemap',
        ...STORE,
        depth,
        tilt: 30,
        perspective: 0,
        textinfo: 'label',
        marker: { line: { width: 1 } },
      },
    ],
    layout: {
      title: { text: 'Sales by category, raised by margin' },
      margin: { l: 20, r: 20, t: 50, b: 20 },
    },
    config: { responsive: true },
  }));
}
