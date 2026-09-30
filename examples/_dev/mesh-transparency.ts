import { meshGrid, sphere, torus } from '../_lib/mesh3d.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Translucent meshes (plan E2.14, 3D): left, three overlapping translucent spheres around an
 * opaque one (objects sorted back to front by three.js, no depth writes for translucent ones);
 * middle, a translucent torus whose triangles are sorted back to front each time the view changes
 * (the near side composites over the far side); right, the same torus unsorted (`sortTriangles:
 * false`), where triangles drawn in index order hide or double up.
 */
export const meta: ExampleMeta = {
  title: 'Mesh transparency',
  description:
    'Translucent meshes composited back to front: objects and triangles sorted by depth.',
  tags: ['dev', 'primitives', '3d', 'mesh', 'transparency'],
  size: { width: 780, height: 300 },
};

export function run(el: HTMLElement): ExampleHandle {
  const grid = meshGrid(el, 3, 1, [2.4, -2.9, 1.7]);
  const spheres: [[number, number, number], [number, number, number, number]][] = [
    [
      [-0.35, -0.2, 0],
      [0.84, 0.15, 0.16, 1],
    ],
    [
      [0.35, -0.2, 0],
      [0.17, 0.63, 0.17, 1],
    ],
    [
      [0, 0.4, 0],
      [0.12, 0.47, 0.71, 1],
    ],
  ];
  const core = sphere(0.22, [0, 0, 0]);
  grid.add(0, { positions: core.positions, indices: core.indices, color: [1, 0.5, 0.05, 1] });
  for (const [center, color] of spheres) {
    const s = sphere(0.5, center);
    grid.add(0, { positions: s.positions, indices: s.indices, color, opacity: 0.45 });
  }
  const ring = torus(0.65, 0.3, 48, 24);
  const ringData = {
    positions: ring.positions,
    indices: ring.indices,
    color: [0.58, 0.4, 0.74, 1] as const,
    opacity: 0.5,
  };
  grid.add(1, ringData);
  grid.add(2, { ...ringData, sortTriangles: false });
  return { renderer: grid.root.renderer, ready: grid.ready(), dispose: () => grid.dispose() };
}
