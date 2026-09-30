import { createChart } from '@mk7s/holochart';
import { ringStarts, sourceSink } from '../_lib/streamtube-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Stream tube colors (plan E14.6): the speed maps through `colorscale` ('Viridis') over a fixed
 * domain (`cmin: 0`, `cmax: 2`: the fastest flow, near the poles, clips to the last color), with a
 * titled colorbar; the tubes leave a source and enter a sink.
 */
export const meta: ExampleMeta = {
  title: 'Stream tubes: colorscale, cmin / cmax and colorbar',
  description: 'A source–sink flow colored by speed on a fixed Viridis domain.',
  tags: ['streamtube', '3d', 'vector field', 'colorscale', 'colorbar'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'streamtube',
        name: 'dipole',
        ...sourceSink(),
        starts: ringStarts(16, 0.3, -0.8),
        sizeref: 1.2,
        colorscale: 'Viridis',
        cmin: 0,
        cmax: 2,
        colorbar: { title: { text: 'speed' } },
      },
    ],
    layout: {
      title: { text: 'Source and sink, colored by speed' },
      scene: { camera: { eye: { x: 0.4, y: -1.8, z: 1 } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
