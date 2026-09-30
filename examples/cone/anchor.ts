import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * `anchor` (plan E14.5): four cones along +x, all positioned on the plane x = 0 (drawn as a
 * translucent `mesh3d` rectangle), one per anchor: `tip` ends at the plane, `tail` starts at it,
 * `cm` (the default, the center of mass) crosses it a quarter of the way from the tail, and
 * `center` halfway. Seen from above, the plane is the gray band.
 */
export const meta: ExampleMeta = {
  title: 'Cone: anchors tip, tail, cm and center',
  description: 'Four cones positioned on one plane, each anchored differently.',
  tags: ['cone', '3d', 'vector field', 'anchor'],
  testTolerance: 0.004,
};

const ANCHORS = ['tip', 'tail', 'cm', 'center'] as const;

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      ...ANCHORS.map((anchor, k) => ({
        type: 'cone',
        name: anchor,
        x: [0],
        y: [k],
        z: [0],
        u: [1],
        v: [0],
        w: [0],
        sizemode: 'raw',
        sizeref: 2,
        anchor,
        showscale: false,
        colorscale: [
          [0, '#5e74d5'],
          [1, '#5e74d5'],
        ],
        text: [anchor],
      })),
      {
        type: 'mesh3d',
        name: 'x = 0',
        x: [0, 0, 0, 0],
        y: [-0.6, 3.6, 3.6, -0.6],
        z: [-0.6, -0.6, 0.6, 0.6],
        i: [0, 0],
        j: [1, 2],
        k: [2, 3],
        color: '#a4a7b5',
        opacity: 0.25,
        hoverinfo: 'skip',
      },
    ],
    layout: {
      title: { text: "anchor: 'tip', 'tail', 'cm', 'center' (y = 0, 1, 2, 3)" },
      scene: {
        aspectmode: 'data',
        camera: { eye: { x: 0.2, y: -0.7, z: 2.1 } },
        xaxis: { range: [-2.2, 2.2] },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
