import { createChart } from '@mk7s/holochart';
import { linspace, peaks, sample } from '../_lib/surface-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A surface from a 2D `z` alone (plan E14.3): the columns and rows are placed at their indices,
 * the heights colored by the default look's sequential colorscale with a colorbar (a cube scene,
 * so the heights are not flattened against the 50 columns and rows). The surface is
 * built on the GPU from a height texture; hover shows the nearest grid point's x, y and z and
 * draws its highlight contour lines.
 */
export const meta: ExampleMeta = {
  title: 'Surface: basic',
  description: 'A 50 × 50 height field from `z` alone, lit and colored by height, with a colorbar.',
  tags: ['surface', '3d', 'scientific', 'colorscale'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const axis = linspace(-3, 3, 50);
  const chart = createChart(el, {
    data: [{ type: 'surface', z: sample(axis, axis, peaks) }],
    layout: {
      title: { text: 'Peaks' },
      scene: { aspectmode: 'cube', camera: { eye: { x: 1.5, y: 1.4, z: 0.9 } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
