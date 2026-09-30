import { createChart } from '@mk7s/holochart';
import { ICOSAHEDRON } from '../_lib/mesh3d-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Per-vertex and per-face colors (plan E14.4): `vertexcolor` gives each vertex a CSS color,
 * blended across the triangles (left); `facecolor` gives each triangle one (right). Plotly's
 * precedence: `intensity`, then `vertexcolor`, then `facecolor`, then `color`.
 */
export const meta: ExampleMeta = {
  title: 'Mesh3d: vertex colors and face colors',
  description: 'An icosahedron colored per vertex (blended) and per face.',
  tags: ['mesh3d', '3d', 'mesh', 'vertexcolor', 'facecolor'],
  size: { width: 800, height: 400 },
  testTolerance: 0.004,
};

const PALETTE = ['#ea2a37', '#5e74d5', '#9962c0', '#118e36', '#cc540a', '#128b8b', '#997600'];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'mesh3d',
        name: 'vertexcolor',
        ...ICOSAHEDRON,
        vertexcolor: ICOSAHEDRON.x.map((_, v) => PALETTE[v % PALETTE.length]!),
      },
      {
        type: 'mesh3d',
        name: 'facecolor',
        scene: 'scene2',
        ...ICOSAHEDRON,
        facecolor: ICOSAHEDRON.i.map((_, t) => PALETTE[t % PALETTE.length]!),
      },
    ],
    layout: {
      title: { text: 'vertexcolor (left) and facecolor (right)' },
      scene: { domain: { x: [0, 0.5] } },
      scene2: { domain: { x: [0.5, 1] } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
