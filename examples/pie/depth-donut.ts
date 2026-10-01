import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { chartExample } from '../_lib/hierarchy.ts';

/**
 * A 3D donut (plan E9.12): with `hole` the slices become annular sectors, extruded by `depth` and
 * rounded by `bevel`, and the trace title stays in the hole. `perspective: 0` draws a parallel
 * projection, the classic look of 3D pies.
 */
export const meta: ExampleMeta = {
  title: 'Pie: 3D donut (hole, bevel)',
  description: 'A tilted donut with rounded edges and the total in the hole.',
  tags: ['pie', 'donut', 'chart', 'depth', 'bevel', '2.5d', '3d-native', 'holochart-extension'],
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  return chartExample(el, () => ({
    data: [
      {
        type: 'pie',
        name: 'Sessions',
        labels: ['Desktop', 'Mobile', 'Tablet', 'Smart TV', 'Other'],
        values: [5820, 4310, 960, 420, 190],
        hole: 0.5,
        textinfo: 'percent',
        depth: 28,
        bevel: { size: 5, segments: 4 },
        tilt: 55,
        perspective: 0,
        marker: { line: { width: 3 } },
        title: { text: '<b>11,700</b><br>sessions', position: 'middle center', font: { size: 16 } },
      },
    ],
    config: { responsive: true },
  }));
}
