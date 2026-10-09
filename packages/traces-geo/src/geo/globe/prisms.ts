/**
 * Regions raised from the globe (backlog GEO8: "region height from a second value, as prisms
 * rising from the sphere"). A prism is a region's patch of the sphere moved out to its height,
 * the cap, and walls from the surface up to the cap along the region's boundary.
 *
 * The walls stand on {@link SphereMesh.boundary}, which leaves out the edges a region only has
 * because it was cut at the antimeridian or closed around a pole: those are inside the region,
 * and a wall there would cross it.
 */
import type { SphereMesh } from './mesh.ts';

/** Options of {@link buildPrisms}. */
export interface PrismsOptions {
  /** Multiplies every height. Default 1. */
  readonly scale?: number;
  /**
   * Leave the cap triangles of the regions that are not raised out of {@link PrismMesh.indices}.
   * For a caller that draws those regions itself, as a layer on the sphere without a depth test
   * (ADR-028 "Depth"): a cap at radius 1 that tests depth would fight the globe's body. The
   * vertices are all kept, so the caps' vertices are still the mesh's, in its order. Default
   * false.
   */
  readonly raisedOnly?: boolean;
}

/**
 * The prisms of a mesh, as one mesh. Its first {@link capVertexCount} vertices are the caps: the
 * vertices of the mesh it was built from, in the same order, so what is known per vertex of that
 * mesh (a color) is known per cap vertex. The walls follow, four vertices each.
 */
export interface PrismMesh {
  /** x, y, z of each vertex, in globe coordinates: the surface is at radius 1. */
  positions: Float32Array;
  /** Unit normals: the sphere's on a cap, and on a wall the wall's own, away from the region. */
  normals: Float32Array;
  /** Three vertices per triangle, counter-clockwise seen from outside the prism. */
  indices: Uint32Array;
  /** For each vertex, the index of its region's feature. */
  featureOf: Uint32Array;
  vertexCount: number;
  triangleCount: number;
  /**
   * The vertices and triangles of the caps, which come first. With `raisedOnly` the triangles are
   * those of the raised regions alone.
   */
  capVertexCount: number;
  capTriangleCount: number;
}

/**
 * Raise the regions of `mesh` (a result of `buildSphereMesh`): the cap of feature `f` is at
 * radius `1 + heights[f]`, in globe radii, and its walls run from the surface to the cap along
 * the region's boundary. A height that is 0, negative, missing or not finite leaves the region on
 * the surface, with no walls.
 *
 * Cap and walls meet in the same points: a wall's upper corners are computed as the cap's
 * vertices are, so the prism has no gap along its rim.
 */
export function buildPrisms(
  mesh: SphereMesh,
  heights: ArrayLike<number>,
  options: PrismsOptions = {},
): PrismMesh {
  const scale = options.scale ?? 1;
  const heightOf = (feature: number): number => {
    const h = (heights[feature] as number) * scale;
    return h > 0 && Number.isFinite(h) ? h : 0;
  };
  const caps = mesh.vertexCount;
  const source = mesh.positions;
  // The cap triangles that are drawn: all of them, or those of the raised regions.
  let capIndices = mesh.indices;
  if (options.raisedOnly === true) {
    const kept = new Uint32Array(mesh.indices.length);
    let n = 0;
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const a = mesh.indices[t] as number;
      // Regions share no vertices: a triangle's first vertex names its region.
      if (!(heightOf(mesh.featureOf[a] as number) > 0)) continue;
      kept[n++] = a;
      kept[n++] = mesh.indices[t + 1] as number;
      kept[n++] = mesh.indices[t + 2] as number;
    }
    capIndices = kept.subarray(0, n);
  }
  let walls = 0;
  for (let e = 0; e < mesh.boundaryCount; e++) {
    if (heightOf(mesh.featureOf[mesh.boundary[2 * e] as number] as number) > 0) walls++;
  }
  const vertexCount = caps + 4 * walls;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const featureOf = new Uint32Array(vertexCount);
  const indices = new Uint32Array(capIndices.length + 6 * walls);

  // Caps: the mesh, each vertex moved out along its normal.
  for (let v = 0; v < caps; v++) {
    const f = mesh.featureOf[v] as number;
    const r = 1 + heightOf(f);
    for (let k = 0; k < 3; k++) {
      const c = source[3 * v + k] as number;
      positions[3 * v + k] = c * r;
      normals[3 * v + k] = c;
    }
    featureOf[v] = f;
  }
  indices.set(capIndices);

  // Walls: for an edge run with the region on its left, the quad from the surface up to the cap
  // faces right, away from the region.
  let v = caps;
  let i = capIndices.length;
  for (let e = 0; e < mesh.boundaryCount; e++) {
    const a = mesh.boundary[2 * e] as number;
    const b = mesh.boundary[2 * e + 1] as number;
    const f = mesh.featureOf[a] as number;
    const h = heightOf(f);
    if (!(h > 0)) continue;
    const ax = source[3 * a] as number;
    const ay = source[3 * a + 1] as number;
    const az = source[3 * a + 2] as number;
    const bx = source[3 * b] as number;
    const by = source[3 * b + 1] as number;
    const bz = source[3 * b + 2] as number;
    // Along the edge, crossed with straight up in its middle.
    const ex = bx - ax;
    const ey = by - ay;
    const ez = bz - az;
    const ux = ax + bx;
    const uy = ay + by;
    const uz = az + bz;
    let nx = ey * uz - ez * uy;
    let ny = ez * ux - ex * uz;
    let nz = ex * uy - ey * ux;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length;
    ny /= length;
    nz /= length;
    // Bottom at `a` and `b`, then top at `b` and `a`: the cap's own two vertices.
    positions.set([ax, ay, az, bx, by, bz], 3 * v);
    for (let k = 0; k < 3; k++) {
      positions[3 * (v + 2) + k] = positions[3 * b + k] as number;
      positions[3 * (v + 3) + k] = positions[3 * a + k] as number;
    }
    for (let k = 0; k < 4; k++) {
      normals[3 * (v + k)] = nx;
      normals[3 * (v + k) + 1] = ny;
      normals[3 * (v + k) + 2] = nz;
      featureOf[v + k] = f;
    }
    indices[i++] = v;
    indices[i++] = v + 1;
    indices[i++] = v + 2;
    indices[i++] = v;
    indices[i++] = v + 2;
    indices[i++] = v + 3;
    v += 4;
  }

  return {
    positions,
    normals,
    indices,
    featureOf,
    vertexCount,
    triangleCount: indices.length / 3,
    capVertexCount: caps,
    capTriangleCount: capIndices.length / 3,
  };
}
