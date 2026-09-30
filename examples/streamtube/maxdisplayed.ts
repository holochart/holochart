import { createChart } from '@mk7s/holochart';
import { abcFlow } from '../_lib/streamtube-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Tube length (plan E14.6): `maxdisplayed` caps the samples per tube and sets the sampling step
 * (10 / `maxdisplayed` of the field's diagonal). The same four starts in the ABC flow: the default
 * 1000 on the left (long tubes, until they leave the field), 60 on the right (a coarser step, at
 * most 60 samples: shorter, faceted tubes).
 */
export const meta: ExampleMeta = {
  title: 'Stream tubes: maxdisplayed',
  description: 'The same stream tubes with the default and a small maxdisplayed.',
  tags: ['streamtube', '3d', 'vector field', 'multiple scenes'],
  testTolerance: 0.004,
  size: { width: 800, height: 400 },
};

export function run(el: HTMLElement): ExampleHandle {
  const field = abcFlow(12);
  const starts = { x: [2, 4, 2, 4], y: [3, 3, 3, 3], z: [2, 2, 4, 4] };
  const camera = { eye: { x: 1.4, y: -1.5, z: 0.9 } };
  const chart = createChart(el, {
    data: [
      {
        type: 'streamtube',
        name: 'default (1000)',
        ...field,
        starts,
        sizeref: 0.5,
        showscale: false,
      },
      {
        type: 'streamtube',
        name: 'maxdisplayed 60',
        scene: 'scene2',
        ...field,
        starts,
        sizeref: 0.5,
        maxdisplayed: 60,
      },
    ],
    layout: {
      title: { text: 'maxdisplayed: 1000 (left) and 60 (right)' },
      scene: { domain: { x: [0, 0.47] }, camera },
      scene2: { domain: { x: [0.47, 0.94] }, camera },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
