/**
 * The `surfaceaxis` surface of `scatter3d` (plan E14.2), after plotly.js `scatter3d/convert.js`
 * (`constructDelaunay`): the points are triangulated (Delaunay) in the plane of the two other
 * axes — `surfaceaxis: 2` triangulates `(x, y)` — and the triangles keep each point's full 3D
 * position, so the surface runs through the points. Triangulated in scene units, as Plotly does
 * after its data scaling, so the triangles follow the scene's aspect ratio. Pure.
 */
import type { DataTransform } from '@mk7s/holochart-render';
import { delaunayTriangles } from './delaunay.ts';

/** Triangles of a `surfaceaxis` surface: scene-unit positions (3 per point) and indices. */
export interface SurfaceTriangles {
  readonly positions: Float32Array;
  readonly index: Uint32Array;
}

/**
 * The surface through `(x, y, z)` (linear coordinates) for `surfaceaxis` `axis` (0, 1 or 2), in
 * scene units under `transform`. Points with a non-finite coordinate are left out.
 */
export function surfaceTriangles(
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  z: ArrayLike<number>,
  axis: number,
  transform: Required<DataTransform>,
): SurfaceTriangles {
  const n = Math.min(x.length, y.length, z.length);
  const t = transform;
  const world = [new Float64Array(n), new Float64Array(n), new Float64Array(n)] as const;
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const wx = x[i]! * t.scaleX + t.offsetX;
    const wy = y[i]! * t.scaleY + t.offsetY;
    const wz = z[i]! * t.scaleZ + t.offsetZ;
    const ok = Number.isFinite(wx) && Number.isFinite(wy) && Number.isFinite(wz);
    world[0][i] = ok ? wx : NaN;
    world[1][i] = ok ? wy : NaN;
    world[2][i] = ok ? wz : NaN;
    positions[i * 3] = ok ? wx : 0;
    positions[i * 3 + 1] = ok ? wy : 0;
    positions[i * 3 + 2] = ok ? wz : 0;
  }
  const u = world[(axis + 1) % 3]!;
  const v = world[(axis + 2) % 3]!;
  return { positions, index: delaunayTriangles(u, v, n) };
}
