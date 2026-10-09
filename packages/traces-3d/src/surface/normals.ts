/**
 * Normals of a surface grid (plan E14.3): the CPU mirror of the vertex shader's (`shader.ts`), for
 * the mesh primitive path (three.js materials) and the tests. The normal at a grid point is the
 * cross product of the central differences to its neighbours along i and j (one-sided at the
 * edges and next to gaps), taken in world units (`scale`: the data → scene scale per axis), so
 * lighting is right whatever the axes' aspect ratio.
 */
import { gridX, gridY, type SurfaceGrid } from './grid.ts';
import type { Vec3 } from '@mk7s/holochart-render';

/**
 * World-space unit normals, 3 per grid point (zero at gaps and where the neighbours are
 * degenerate). With `dataSpace`, each normal is mapped back to data space (`n_data ∝ S · n`), as
 * the mesh primitive's normals are (its normal matrix applies `S⁻¹`).
 */
export function gridNormals(
  grid: SurfaceGrid,
  scale: Readonly<Vec3> = [1, 1, 1],
  dataSpace = false,
  out: Float32Array = new Float32Array(grid.nx * grid.ny * 3),
): Float32Array {
  const { nx, ny } = grid;
  const p: Vec3 = [0, 0, 0];
  const a: Vec3 = [0, 0, 0];
  const b: Vec3 = [0, 0, 0];
  const at = (i: number, j: number, o: Vec3): boolean => {
    o[0] = gridX(grid, i, j);
    o[1] = gridY(grid, i, j);
    o[2] = grid.z[j * nx + i]!;
    return Number.isFinite(o[0]) && Number.isFinite(o[1]) && Number.isFinite(o[2]);
  };
  /** The neighbour at (i, j), or the center where there is none. */
  const neighbour = (i: number, j: number, o: Vec3): void => {
    if (i < 0 || j < 0 || i >= nx || j >= ny || !at(i, j, o)) {
      o[0] = p[0];
      o[1] = p[1];
      o[2] = p[2];
    }
  };
  const [sx, sy, sz] = scale;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = (j * nx + i) * 3;
      out[k] = out[k + 1] = out[k + 2] = 0;
      if (!at(i, j, p)) continue;
      neighbour(i + 1, j, a);
      neighbour(i - 1, j, b);
      const dx: Vec3 = [(a[0] - b[0]) * sx, (a[1] - b[1]) * sy, (a[2] - b[2]) * sz];
      neighbour(i, j + 1, a);
      neighbour(i, j - 1, b);
      const dy: Vec3 = [(a[0] - b[0]) * sx, (a[1] - b[1]) * sy, (a[2] - b[2]) * sz];
      let nxv = dx[1] * dy[2] - dx[2] * dy[1];
      let nyv = dx[2] * dy[0] - dx[0] * dy[2];
      let nzv = dx[0] * dy[1] - dx[1] * dy[0];
      if (dataSpace) {
        nxv *= sx;
        nyv *= sy;
        nzv *= sz;
      }
      const len = Math.hypot(nxv, nyv, nzv);
      if (!(len > 0) || !Number.isFinite(len)) continue;
      out[k] = nxv / len;
      out[k + 1] = nyv / len;
      out[k + 2] = nzv / len;
    }
  }
  return out;
}
