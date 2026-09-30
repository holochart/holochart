import { createChart } from '@mk7s/holochart';
import { scalarGrid, linspace } from '../_lib/volume-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * An `isosurface` (plan E14.8), Plotly's documentation example: the field
 * `x²/2 + y² + 2z²` on a 30³ grid over [-5, 5]³ (flattened columns), with the isosurfaces at 10
 * and 40 (`isomin`, `isomax`; `surface.count` 2) — nested ellipsoids — colored by value through the
 * layout's sequential ramp. The caps at the ends of x and y are hidden, so the cut ellipsoids stay
 * open there; the z caps close them at the top and bottom of the grid.
 */
export const meta: ExampleMeta = {
  title: 'Isosurface: nested ellipsoids',
  description: 'Two isosurfaces of a quadratic field, with the x and y caps hidden.',
  tags: ['isosurface', '3d', 'scientific'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const a = linspace(30, -5, 5);
  const grid = scalarGrid(a, a, a, (x, y, z) => x * x * 0.5 + y * y + z * z * 2);
  const chart = createChart(el, {
    data: [
      {
        type: 'isosurface',
        ...grid,
        isomin: 10,
        isomax: 40,
        caps: { x: { show: false }, y: { show: false } },
      },
    ],
    layout: { title: { text: 'x²/2 + y² + 2z² = 10 and 40' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
