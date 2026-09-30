import { createChart } from '@mk7s/holochart';
import { linspace, scalarGrid } from '../_lib/volume-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Slices (plan E14.8), after Plotly's documentation example: the field `x²/2 + y² + 2z²` between 5
 * and 50, its surfaces drawn at 40 % (`surface.fill: 0.4`, open triangles), the x and y caps
 * hidden, and slices through the grid — two planes of constant z at -1 and -3 (between grid
 * planes: interpolated) and one of constant y at 0 — colored by value where it is in range.
 */
export const meta: ExampleMeta = {
  title: 'Isosurface: slices',
  description: 'Slices of constant z and y through a field, with open isosurfaces around them.',
  tags: ['isosurface', '3d', 'scientific'],
  testTolerance: 0.006,
};

export function run(el: HTMLElement): ExampleHandle {
  const a = linspace(30, -5, 5);
  const grid = scalarGrid(a, a, a, (x, y, z) => x * x * 0.5 + y * y + z * z * 2);
  const chart = createChart(el, {
    data: [
      {
        type: 'isosurface',
        ...grid,
        isomin: 5,
        isomax: 50,
        surface: { fill: 0.4 },
        caps: { x: { show: false }, y: { show: false } },
        slices: {
          z: { show: true, locations: [-1, -3] },
          y: { show: true, locations: [0] },
        },
      },
    ],
    layout: {
      title: { text: 'Slices at z = -1, -3 and y = 0' },
      scene: { camera: { eye: { x: 1.9, y: -1.1, z: 0.6 } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
