import { createChart } from '@mk7s/holochart';
import { cubeGrid, gyroid } from '../_lib/volume-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Caps (plan E14.8): the gyroid `sin x cos y + sin y cos z + sin z cos x` on a 32³ grid over one
 * period, drawn from 0 up (`isomin: 0`, `isomax: 2`, above the field's maximum of 1.5) — one of
 * the two interleaved channels of the gyroid, as a solid. With the caps (the default, left) the
 * grid's boundary faces close the solid where the values are in range, so it reads as a block cut
 * from an infinite lattice; without them (right) only the surface at 0 is left, open at the box.
 */
export const meta: ExampleMeta = {
  title: 'Isosurface: caps',
  description: 'A gyroid solid closed by caps on the grid boundary, and the same without caps.',
  tags: ['isosurface', '3d', 'scientific'],
  testTolerance: 0.006,
};

export function run(el: HTMLElement): ExampleHandle {
  const grid = cubeGrid(32, 0, 2 * Math.PI, gyroid);
  const base = { type: 'isosurface', ...grid, isomin: 0, isomax: 2 };
  const off = { show: false };
  const camera = { eye: { x: 1.5, y: -1.4, z: 1.1 } };
  const chart = createChart(el, {
    data: [
      { ...base, name: 'caps', showscale: false },
      { ...base, name: 'no caps', scene: 'scene2', caps: { x: off, y: off, z: off } },
    ],
    layout: {
      title: { text: 'Gyroid ≥ 0: with caps (left) and without' },
      margin: { l: 10, r: 10, t: 40, b: 10 },
      scene: { domain: { x: [0, 0.5] }, camera },
      scene2: { domain: { x: [0.5, 1] }, camera },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
