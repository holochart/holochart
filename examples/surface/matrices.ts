import { createChart } from '@mk7s/holochart';
import { linspace } from '../_lib/surface-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A surface on 2D `x` / `y` arrays (plan E14.3): each grid point has its own x and y, so the grid
 * need not be rectangular. Here a polar grid (rings × spokes) makes a round, damped ripple; the
 * x, y and z matrices are three textures and the normals come from each point's neighbours.
 */
export const meta: ExampleMeta = {
  title: 'Surface: x and y matrices',
  description: 'A polar grid given as 2D x and y arrays: a round ripple on a non-rectangular grid.',
  tags: ['surface', '3d', 'scientific'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const radius = linspace(0, 6, 36);
  const angle = linspace(0, 2 * Math.PI, 72);
  const x = radius.map((r) => angle.map((a) => r * Math.cos(a)));
  const y = radius.map((r) => angle.map((a) => r * Math.sin(a)));
  const z = radius.map((r) => angle.map(() => Math.cos(2 * r) * Math.exp(-r / 3)));
  const chart = createChart(el, {
    data: [{ type: 'surface', x, y, z, showscale: false }],
    layout: {
      title: { text: 'Damped ripple on a polar grid' },
      scene: { aspectmode: 'manual', aspectratio: { x: 1, y: 1, z: 0.4 } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
