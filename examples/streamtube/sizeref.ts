import { createChart } from '@mk7s/holochart';
import { ringStarts, sourceSink } from '../_lib/streamtube-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Tube size (plan E14.6): a source and a sink (a dipole field) with tubes started on a ring
 * around the source. The radius follows the divergence — thick where the flow spreads out of the
 * source and gathers into the sink, thin between — scaled by `sizeref`: 0.4 on the left, 1.5 on
 * the right.
 */
export const meta: ExampleMeta = {
  title: 'Stream tubes: sizeref',
  description: 'A source–sink flow with thin and thick tubes (sizeref 0.4 and 1.5).',
  tags: ['streamtube', '3d', 'vector field', 'multiple scenes'],
  testTolerance: 0.004,
  size: { width: 800, height: 400 },
};

export function run(el: HTMLElement): ExampleHandle {
  const field = sourceSink();
  const starts = ringStarts(12, 0.35, -0.8);
  const camera = { eye: { x: 0.2, y: -1.9, z: 0.9 } };
  const chart = createChart(el, {
    data: [
      {
        type: 'streamtube',
        name: 'sizeref 0.4',
        ...field,
        starts,
        sizeref: 0.4,
        coloraxis: 'coloraxis',
      },
      {
        type: 'streamtube',
        name: 'sizeref 1.5',
        scene: 'scene2',
        ...field,
        starts,
        sizeref: 1.5,
        coloraxis: 'coloraxis',
      },
    ],
    layout: {
      title: { text: 'sizeref 0.4 (left) and 1.5 (right)' },
      coloraxis: { colorbar: { title: { text: 'speed' } } },
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
