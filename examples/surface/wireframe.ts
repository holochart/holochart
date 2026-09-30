import { createChart } from '@mk7s/holochart';
import { linspace, sample } from '../_lib/surface-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The wireframe overlay (plan E14.3, a Holochart extension): `wireframe.show` draws the grid lines
 * of the surface over it, every `step`-th row and column, anti-aliased in the shader (no line
 * geometry), `width` px wide at any zoom.
 */
export const meta: ExampleMeta = {
  title: 'Surface: wireframe',
  description: 'A Gaussian bump with its grid drawn over it, every fourth grid line.',
  tags: ['surface', '3d', 'scientific', '3d-native'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const axis = linspace(-2, 2, 49);
  const chart = createChart(el, {
    data: [
      {
        type: 'surface',
        x: axis,
        y: axis,
        z: sample(axis, axis, (x, y) => Math.exp(-(x * x + y * y)) * 2 - 0.3 * x),
        showscale: false,
        wireframe: { show: true, step: 4, width: 1, color: 'rgba(255, 255, 255, 0.55)' },
      },
    ],
    layout: {
      title: { text: 'Gaussian bump with wireframe' },
      scene: { camera: { eye: { x: 1.4, y: -1.6, z: 1 } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
