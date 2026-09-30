import { createChart } from '@mk7s/holochart';
import { linspace, ripple, sample } from '../_lib/surface-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * `opacityscale` (plan E14.3): opacity by color value, like a colorscale of opacities. Here the
 * values near zero fade (`[[0, 1], [0.35, 0.15], [0.65, 0.15], [1, 1]]`), so only the crests and
 * troughs of the ripple stay solid. Translucent surfaces draw without depth writes, their cells
 * walked from the far side of the grid, so they blend back to front without sorting.
 */
export const meta: ExampleMeta = {
  title: 'Surface: opacityscale',
  description: 'A ripple whose values near zero fade out through an opacity scale.',
  tags: ['surface', '3d', 'scientific', 'opacity'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const axis = linspace(-12, 12, 80);
  const chart = createChart(el, {
    data: [
      {
        type: 'surface',
        x: axis,
        y: axis,
        z: sample(axis, axis, ripple),
        cmid: 0,
        opacityscale: [
          [0, 1],
          [0.35, 0.15],
          [0.65, 0.15],
          [1, 1],
        ],
      },
    ],
    layout: {
      title: { text: 'sin(r) / r with faded zero crossings' },
      scene: { camera: { eye: { x: 1.3, y: -1.5, z: 0.9 } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
