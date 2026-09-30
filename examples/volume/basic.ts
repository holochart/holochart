import { createChart } from '@mk7s/holochart';
import { cubeGrid, sinc3 } from '../_lib/volume-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A `volume` (plan E14.7), Plotly's documentation example: `sin(xyz) / (xyz)` on a 40³ grid over
 * [-8, 8]³, drawn as Plotly does — 17 translucent isosurfaces stacked from 0.1 to 0.8
 * (`surface.count`, `opacity: 0.1`), their triangles sorted back to front.
 */
export const meta: ExampleMeta = {
  title: 'Volume: stacked isosurfaces',
  description: 'A 3D field drawn as 17 translucent isosurfaces, as Plotly draws volumes.',
  tags: ['volume', '3d', 'scientific'],
  testTolerance: 0.006,
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'volume',
        ...cubeGrid(40, -8, 8, sinc3),
        isomin: 0.1,
        isomax: 0.8,
        opacity: 0.1,
        surface: { count: 17 },
      },
    ],
    layout: { title: { text: 'sin(xyz) / xyz, 17 isosurfaces' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
