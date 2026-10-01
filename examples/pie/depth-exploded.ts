import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { chartExample } from '../_lib/hierarchy.ts';

/**
 * An exploded 3D pie (plan E9.12): `pull` moves slices out along their bisectors, in 3D too, and
 * `material` shades the slices with a three.js material (`standard`: a little metallic, glossy).
 */
export const meta: ExampleMeta = {
  title: 'Pie: exploded 3D pie (pull, material)',
  description: 'A tilted pie with two slices pulled out, shaded with a standard material.',
  tags: ['pie', 'chart', 'depth', 'pull', 'material', '2.5d', '3d-native', 'holochart-extension'],
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  return chartExample(el, () => ({
    data: [
      {
        type: 'pie',
        name: 'Energy',
        labels: ['Solar', 'Wind', 'Hydro', 'Gas', 'Coal', 'Nuclear'],
        values: [18, 24, 16, 22, 8, 12],
        pull: [0.18, 0, 0, 0.1, 0, 0],
        depth: 30,
        tilt: 42,
        bevel: { size: 3 },
        material: { type: 'standard', metalness: 0.15, roughness: 0.45 },
      },
    ],
    layout: { title: { text: 'Electricity mix' } },
    config: { responsive: true },
  }));
}
