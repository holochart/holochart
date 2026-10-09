/**
 * Test helpers: what a mesh on the sphere covers, how its triangles lie and how its edges are
 * shared, measured from the arrays a mesh primitive would be given.
 */

/** What the helpers read of a mesh (`SphereMesh` and `PrismMesh` both have it). */
export interface MeshArrays {
  positions: Float32Array;
  indices: Uint32Array;
}

const DEGREES = 180 / Math.PI;

/** Vertex `v` as a point. */
export function vertex(mesh: MeshArrays, v: number): [number, number, number] {
  const p = mesh.positions;
  return [p[3 * v] as number, p[3 * v + 1] as number, p[3 * v + 2] as number];
}

/** The longitude and latitude of vertex `v`, in degrees. */
export function lonLat(mesh: MeshArrays, v: number): [number, number] {
  const [x, y, z] = vertex(mesh, v);
  const r = Math.hypot(x, y, z);
  return [Math.atan2(x, z) * DEGREES, Math.asin(y / r) * DEGREES];
}

/** `a · (b × c)` of three vertices: positive when they run counter-clockwise from outside. */
export function turn(mesh: MeshArrays, a: number, b: number, c: number): number {
  const [ax, ay, az] = vertex(mesh, a);
  const [bx, by, bz] = vertex(mesh, b);
  const [cx, cy, cz] = vertex(mesh, c);
  return ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
}

/** The angle between two vertices as seen from the centre, in degrees. */
export function arc(mesh: MeshArrays, a: number, b: number): number {
  const p = vertex(mesh, a);
  const q = vertex(mesh, b);
  const cross = Math.hypot(
    p[1] * q[2] - p[2] * q[1],
    p[2] * q[0] - p[0] * q[2],
    p[0] * q[1] - p[1] * q[0],
  );
  return Math.atan2(cross, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]) * DEGREES;
}

export interface Coverage {
  /** The area of the triangles on the unit sphere, in steradians, each counted positive. */
  area: number;
  /** Triangles that run clockwise as seen from outside, by more than rounding. */
  inward: number;
  /** The longest edge, in degrees of arc. */
  longestEdge: number;
}

/**
 * The spherical area of triangles `[first, first + count)` of a mesh on the unit sphere (by
 * default all of them), how many of them face inwards, and their longest edge.
 */
export function coverage(mesh: MeshArrays, first = 0, count = mesh.indices.length / 3): Coverage {
  let area = 0;
  let inward = 0;
  let longestEdge = 0;
  for (let t = first; t < first + count; t++) {
    const a = mesh.indices[3 * t] as number;
    const b = mesh.indices[3 * t + 1] as number;
    const c = mesh.indices[3 * t + 2] as number;
    const p = vertex(mesh, a);
    const q = vertex(mesh, b);
    const r = vertex(mesh, c);
    const det = turn(mesh, a, b, c);
    const pq = p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    const qr = q[0] * r[0] + q[1] * r[1] + q[2] * r[2];
    const rp = r[0] * p[0] + r[1] * p[1] + r[2] * p[2];
    area += Math.abs(2 * Math.atan2(det, 1 + pq + qr + rp));
    // Positions are float32: three points on one arc can be 1e-7 off it either way.
    if (det < -1e-7) inward++;
    longestEdge = Math.max(longestEdge, arc(mesh, a, b), arc(mesh, b, c), arc(mesh, c, a));
  }
  return { area, inward, longestEdge };
}

/**
 * How often each directed edge `a → b` is run by a triangle, by `a * vertexCount + b`. In a mesh
 * without T-junctions an inner edge is run once each way and a boundary edge once.
 */
export function directedEdges(mesh: MeshArrays): Map<number, number> {
  const n = mesh.positions.length / 3;
  const edges = new Map<number, number>();
  for (let i = 0; i < mesh.indices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = mesh.indices[i + k] as number;
      const b = mesh.indices[i + ((k + 1) % 3)] as number;
      const key = a * n + b;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  return edges;
}

/**
 * The rim of the mesh: the edges that one triangle has and no other, as that triangle runs them.
 */
export function rim(mesh: MeshArrays): [number, number][] {
  const n = mesh.positions.length / 3;
  const edges = directedEdges(mesh);
  const out: [number, number][] = [];
  for (const [key, count] of edges) {
    const a = Math.floor(key / n);
    const b = key - a * n;
    if (count === 1 && !edges.has(b * n + a)) out.push([a, b]);
  }
  return out;
}

/** The most triangles that share one edge, whichever way each runs it: 2 without T-junctions. */
export function mostSharedEdge(mesh: MeshArrays): number {
  const n = mesh.positions.length / 3;
  const edges = directedEdges(mesh);
  let most = 0;
  for (const [key, count] of edges) {
    const a = Math.floor(key / n);
    const b = key - a * n;
    most = Math.max(most, count + (edges.get(b * n + a) ?? 0));
  }
  return most;
}

/** The point of the unit sphere at a longitude and latitude, in globe coordinates. */
export function point(lon: number, lat: number): [number, number, number] {
  const lambda = lon / DEGREES;
  const phi = lat / DEGREES;
  return [Math.cos(phi) * Math.sin(lambda), Math.sin(phi), Math.cos(phi) * Math.cos(lambda)];
}

/** The angle between two points as seen from the centre, in degrees. */
export function angle(p: readonly number[], q: readonly number[]): number {
  const cross = Math.hypot(
    p[1]! * q[2]! - p[2]! * q[1]!,
    p[2]! * q[0]! - p[0]! * q[2]!,
    p[0]! * q[1]! - p[1]! * q[0]!,
  );
  return Math.atan2(cross, p[0]! * q[0]! + p[1]! * q[1]! + p[2]! * q[2]!) * DEGREES;
}
