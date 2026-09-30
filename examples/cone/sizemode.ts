import { createChart } from '@mk7s/holochart';
import { field } from '../_lib/mesh3d-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * `sizemode` (plan E14.5), on one field whose vectors grow from the center out (norms 0.2 to
 * 1.6): `scaled` (default) fits the cones between neighbouring positions, times `sizeref` (0.5);
 * `absolute` does the same with `sizeref` in norm units (here 0.8: the largest vector's cone is
 * 0.8 / 1.6 of the scaled size); `raw` draws each vector's own length in data units, times
 * `sizeref` (0.25).
 */
export const meta: ExampleMeta = {
  title: 'Cone: sizemode scaled, absolute and raw',
  description: 'One vector field drawn with each of the three cone sizing modes.',
  tags: ['cone', '3d', 'vector field', 'sizemode'],
  size: { width: 900, height: 380 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const f = field(5, 2, (x, y) => {
    const r = Math.hypot(x, y) + 0.15;
    return [x * r, y * r, 0.2];
  });
  const common = { ...f, coloraxis: 'coloraxis' } as const;
  const chart = createChart(el, {
    data: [
      { type: 'cone', name: 'scaled', ...common },
      {
        type: 'cone',
        name: 'absolute',
        scene: 'scene2',
        ...common,
        sizemode: 'absolute',
        sizeref: 0.8,
      },
      { type: 'cone', name: 'raw', scene: 'scene3', ...common, sizemode: 'raw', sizeref: 0.25 },
    ],
    layout: {
      title: { text: "sizemode: 'scaled', 'absolute' (sizeref 0.8), 'raw' (sizeref 0.25)" },
      grid: { rows: 1, columns: 3 },
      scene: { domain: { row: 0, column: 0 }, camera: { eye: { x: 0.35, y: -2.1, z: 1.9 } } },
      scene2: { domain: { row: 0, column: 1 }, camera: { eye: { x: 0.35, y: -2.1, z: 1.9 } } },
      scene3: { domain: { row: 0, column: 2 }, camera: { eye: { x: 0.35, y: -2.1, z: 1.9 } } },
      coloraxis: { showscale: false },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
