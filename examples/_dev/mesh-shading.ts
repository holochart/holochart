import { createPicker } from '@mk7s/holochart-render';
import { BLUE, meshGrid, surfaceGrid, VIRIDIS } from '../_lib/mesh3d.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The mesh primitive (plan E2.11) with Plotly's lighting model, in six panels (left to right, top
 * to bottom): smooth shading; flat shading (Plotly's `flatshading`, face normals); per-vertex
 * intensity through a colorscale (sampled per fragment); per-cell intensity (`intensitymode:
 * 'cell'`); a double-sided saddle seen from below (both sides lit, as in Plotly); a saddle seen
 * from above with back faces culled (`side: 'front'`), per-face colors and flat shading. Loaded lazily: the
 * example is ready once the mesh chunk has arrived.
 */
export const meta: ExampleMeta = {
  title: 'Mesh shading',
  description:
    'Mesh primitive: smooth vs flat shading, vertex vs cell intensity, double-sided and culled faces.',
  tags: ['dev', 'primitives', '3d', 'mesh'],
  size: { width: 720, height: 480 },
};

const bump = (x: number, y: number) =>
  0.7 * Math.exp(-2.5 * (x * x + y * y)) - 0.25 * Math.exp(-6 * ((x - 0.5) ** 2 + (y + 0.5) ** 2));
const saddle = (x: number, y: number) => 0.45 * (x * x - y * y);

export function run(el: HTMLElement): ExampleHandle {
  const grid = meshGrid(el, 3, 2);
  const fine = surfaceGrid(40, bump);
  const coarse = surfaceGrid(8, bump);
  const cells = surfaceGrid(8, bump);
  const saddleMesh = surfaceGrid(16, saddle);

  grid.add(0, { positions: fine.positions, indices: fine.indices, color: BLUE });
  grid.add(1, {
    positions: coarse.positions,
    indices: coarse.indices,
    color: BLUE,
    shading: 'flat',
  });
  grid.add(2, {
    positions: fine.positions,
    indices: fine.indices,
    intensity: fine.values,
    colorscale: VIRIDIS,
  });
  // One value per triangle: the triangle's mean height.
  const cellValues = new Float32Array(cells.indices.length / 3);
  for (let t = 0; t < cellValues.length; t++) {
    let sum = 0;
    for (let k = 0; k < 3; k++) sum += cells.values[cells.indices[t * 3 + k]!]!;
    cellValues[t] = sum / 3;
  }
  grid.add(3, {
    positions: cells.positions,
    indices: cells.indices,
    intensity: cellValues,
    intensityMode: 'cell',
    colorscale: VIRIDIS,
  });
  grid.add(4, { positions: saddleMesh.positions, indices: saddleMesh.indices, color: BLUE });
  const faces = new Float32Array((saddleMesh.indices.length / 3) * 4);
  for (let t = 0; t < faces.length / 4; t++) {
    const even = Math.floor(t / 2) % 2 === 0;
    faces.set(even ? [0.84, 0.15, 0.16, 1] : [0.17, 0.63, 0.17, 1], t * 4);
  }
  grid.add(5, {
    positions: saddleMesh.positions,
    indices: saddleMesh.indices,
    faceColor: faces,
    shading: 'flat',
    side: 'front',
  });
  // The double-sided saddle is seen from below: its back side is lit too.
  const c = grid.viewports[4]!.camera;
  c.position.set(3.1, -3.7, -2.2);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  // GPU picking (E2.13) through the mesh's own pick shader: the center of the smooth panel hits
  // a vertex, the flat (expanded) one a triangle. A failed check fails the example's test.
  const picker = createPicker(grid.root);
  grid.meshes.forEach((mesh, i) => picker.add(grid.viewports[i]!, mesh, { traceIndex: i }));
  const ready = grid.ready().then(async () => {
    const [smooth] = await picker.pick(120, 125, { radius: 2 });
    const [flat] = await picker.pick(360, 125, { radius: 2 });
    if (smooth?.traceIndex !== 0 || smooth.kind !== 'vertex' || flat?.kind !== 'triangle') {
      throw new Error(`mesh picking failed: ${JSON.stringify([smooth?.kind, flat?.kind])}`);
    }
  });
  return {
    renderer: grid.root.renderer,
    ready,
    dispose: () => {
      picker.dispose();
      grid.dispose();
    },
  };
}
