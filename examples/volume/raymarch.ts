import { createChart, type VolumeTrace } from '@mk7s/holochart';
import { blobs, cubeGrid } from '../_lib/volume-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A ray-marched `volume` (`render: 'raymarch'`, a Holochart extension, plan E14.7): three Gaussian
 * blobs on a 96³ grid, the values in a 3D texture, every pixel's ray composited front to back
 * through the transfer function — the colorscale for color, `opacity` · `opacityscale: 'max'` for
 * the opacity of one grid cell (the dense cores glow, the thin halos fade). Left as it is; right
 * with gradient shading (`raymarch.shading`).
 */
export const meta: ExampleMeta = {
  title: 'Volume: GPU ray marching',
  description: 'A density field ray-marched on the GPU, plain and with gradient shading.',
  tags: ['volume', '3d', 'scientific', 'raymarch'],
  testTolerance: 0.006,
};

export function run(el: HTMLElement): ExampleHandle {
  const grid = cubeGrid(96, -1, 1, blobs);
  const trace = {
    ...grid,
    render: 'raymarch',
    isomin: 0.05,
    opacity: 0.25,
    opacityscale: 'max',
    colorscale: 'Plasma',
  } satisfies Partial<VolumeTrace>;
  const camera = { eye: { x: 1.4, y: -1.3, z: 0.9 } };
  const chart = createChart(el, {
    data: [
      { type: 'volume', ...trace, name: 'plain', showscale: false },
      {
        type: 'volume',
        ...trace,
        name: 'shaded',
        scene: 'scene2',
        raymarch: { shading: true },
        lighting: { ambient: 0.35, diffuse: 0.9 },
      },
    ],
    layout: {
      title: { text: 'Three Gaussian blobs, 96³, ray-marched' },
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
