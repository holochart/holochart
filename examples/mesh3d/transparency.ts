import { createChart, type LayoutScene, type Mesh3dTrace } from '@mk7s/holochart';
import { placed, torus, uvSphere } from '../_lib/mesh3d-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Translucent meshes (plan E14.4, E2.14): left, three overlapping translucent `mesh3d` spheres
 * (`opacity: 0.45`) around an opaque one — translucent traces are drawn after the opaque ones,
 * farthest first, without writing depth, so the core shows through. Right, a translucent torus
 * whose triangles are sorted back to front each time the view changes, so its near side composites
 * over its far side.
 */
export const meta: ExampleMeta = {
  title: 'Mesh3d: translucent meshes',
  description:
    'Translucent spheres around an opaque core and a translucent torus, composited back to front.',
  tags: ['mesh3d', '3d', 'mesh', 'opacity', 'transparency'],
  size: { width: 800, height: 400 },
  testTolerance: 0.004,
};

const SPHERES: [[number, number, number], string][] = [
  [[-0.35, -0.2, 0], '#d62728'],
  [[0.35, -0.2, 0], '#2ca02c'],
  [[0, 0.4, 0], '#1f77b4'],
];

export function run(el: HTMLElement): ExampleHandle {
  const ball = uvSphere(24, 48);
  const camera = { eye: { x: 1.3, y: -1.6, z: 0.9 } };
  const hidden = { visible: false };
  const scene: LayoutScene = {
    xaxis: hidden,
    yaxis: hidden,
    zaxis: hidden,
    aspectmode: 'data',
    camera,
  };
  const chart = createChart(el, {
    data: [
      { type: 'mesh3d', name: 'core', ...placed(ball, 0.22, [0, 0, 0]), color: '#ff7f0e' },
      ...SPHERES.map(([center, color]): Mesh3dTrace => ({
        type: 'mesh3d',
        ...placed(ball, 0.5, center),
        color,
        opacity: 0.45,
      })),
      {
        type: 'mesh3d',
        name: 'torus',
        scene: 'scene2',
        ...torus(0.65, 0.3, 48, 24),
        color: '#9467bd',
        opacity: 0.5,
      },
    ],
    layout: {
      margin: { l: 10, r: 10, t: 40, b: 10 },
      title: { text: 'Translucent objects (left) and a translucent torus (right)' },
      showlegend: false,
      scene: { ...scene, domain: { x: [0, 0.5] } },
      scene2: { ...scene, domain: { x: [0.5, 1] } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
