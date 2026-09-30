import { createChart } from '@mk7s/holochart';
import { tornado } from '../_lib/streamtube-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A `streamtube` (plan E14.6): a tornado rising along y, sampled on a 7 × 9 × 7 grid (the camera's
 * `up` is y). With no `starts`, the tubes start on the x–z plane at the grid's lowest y, at every
 * x and z node but the first and last (5 × 5 tubes), as in Plotly. Each tube follows the flow (RK4 through the
 * trilinearly interpolated field), is colored by the speed and thickened by the divergence.
 */
export const meta: ExampleMeta = {
  title: 'Stream tubes: a tornado',
  description: 'Stream tubes from the default starting plane through a swirling updraft.',
  tags: ['streamtube', '3d', 'vector field'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [{ type: 'streamtube', name: 'tornado', ...tornado() }],
    layout: {
      title: { text: 'Tornado' },
      scene: { camera: { up: { x: 0, y: 1, z: 0 }, eye: { x: 1.6, y: 0.7, z: 1.2 } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
