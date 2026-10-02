import { createChart } from '@mk7s/holochart';
import { blobs, cubeGrid } from '../_lib/volume-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The two ways to draw a `volume` (plan E14.7) on the same field, three Gaussian blobs on a 48³
 * grid from 0.1 up: Plotly's stacked isosurfaces (`render: 'isosurfaces'`, the default:
 * `surface.count` 10 translucent shells at `opacity: 0.2`, left) and GPU ray marching (`render:
 * 'raymarch'`, a Holochart extension: every value in range, composited per pixel, right). A
 * ray-marched volume's `opacity` is that of one grid cell of material, so it takes a lower one
 * (0.06) for a similar look.
 */
export const meta: ExampleMeta = {
  title: 'Volume: stacked isosurfaces and ray marching',
  description: 'One density field drawn as stacked isosurfaces (as Plotly) and ray-marched.',
  tags: ['volume', '3d', 'scientific', 'raymarch'],
  testTolerance: 0.008,
};

export function run(el: HTMLElement): ExampleHandle {
  const grid = cubeGrid(48, -1, 1, blobs);
  const trace = { ...grid, isomin: 0.1, isomax: 1 };
  const camera = { eye: { x: 1.4, y: -1.4, z: 1 } };
  const chart = createChart(el, {
    data: [
      {
        type: 'volume',
        ...trace,
        name: 'isosurfaces',
        opacity: 0.2,
        surface: { count: 10 },
        showscale: false,
      },
      {
        type: 'volume',
        ...trace,
        name: 'raymarch',
        scene: 'scene2',
        render: 'raymarch',
        opacity: 0.06,
      },
    ],
    layout: {
      title: { text: "render: 'isosurfaces' (left) and 'raymarch'" },
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
