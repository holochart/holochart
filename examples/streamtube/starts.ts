import { createChart } from '@mk7s/holochart';
import { abcFlow } from '../_lib/streamtube-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Explicit starting points (plan E14.6): the Arnold–Beltrami–Childress flow on a 16³ grid over
 * [0, 2π]³, with 9 tubes started from a 3 × 3 patch of the plane x = π (`starts.x`, `starts.y`,
 * `starts.z`). The tube radius follows the divergence of the interpolated field; `sizeref: 0.3`
 * thins them (at 1 the thickest tubes of neighbouring starts would just touch).
 */
export const meta: ExampleMeta = {
  title: 'Stream tubes: explicit starts in the ABC flow',
  description: 'Nine stream tubes started from a patch of the ABC flow.',
  tags: ['streamtube', '3d', 'vector field'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const starts = { x: [] as number[], y: [] as number[], z: [] as number[] };
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      starts.x.push(Math.PI);
      starts.y.push(1.6 + 1.5 * i);
      starts.z.push(1.6 + 1.5 * j);
    }
  }
  const chart = createChart(el, {
    data: [{ type: 'streamtube', name: 'ABC flow', ...abcFlow(16), starts, sizeref: 0.3 }],
    layout: {
      title: { text: 'ABC flow from 9 starting points' },
      scene: { camera: { eye: { x: 1.5, y: -1.4, z: 0.9 } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
