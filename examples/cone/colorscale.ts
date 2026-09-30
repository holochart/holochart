import { createChart } from '@mk7s/holochart';
import { field } from '../_lib/mesh3d-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Cone colors (plan E14.5): the norms map through `colorscale` ('Viridis') over a fixed domain
 * (`cmin: 0`, `cmax: 1.5`: faster vectors clip to the last color), with a titled colorbar; the
 * field is a source flowing out of the center and up. `anchor: 'tail'` starts each cone at its
 * sample point.
 */
export const meta: ExampleMeta = {
  title: 'Cone: colorscale, cmin / cmax and colorbar',
  description: 'An outflow field colored by speed on a fixed Viridis domain.',
  tags: ['cone', '3d', 'vector field', 'colorscale', 'colorbar'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const f = field(6, 3, (x, y, z) => [x, y, 0.3 + z]);
  const chart = createChart(el, {
    data: [
      {
        type: 'cone',
        name: 'outflow',
        ...f,
        anchor: 'tail',
        colorscale: 'Viridis',
        cmin: 0,
        cmax: 1.5,
        colorbar: { title: { text: 'speed' } },
      },
    ],
    layout: {
      title: { text: 'Outflow colored by speed' },
      scene: { camera: { eye: { x: 1.4, y: -1.3, z: 0.9 } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
