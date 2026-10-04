/**
 * Tube geometry of a `streamtube` (plan E14.6): a ring of {@link TUBE_FACETS} vertices around each
 * sample, rings of successive samples joined by two triangles per facet (gl-streamtube3d's
 * layout: 8 facets, open ends), for the mesh primitive. Pure (no three.js).
 *
 * The rings are round in scene units (world), as gl-streamtube3d builds them after its model
 * matrix: a sample's ring lies across the flow (the field's vector at the sample, drawn in scene
 * units; the path's direction where the vector is zero), with the radius `ρ · |W ⊙ u| / |s ⊙ u|` —
 * the tube radius `ρ` (scaled units) along the vector, taken to scene units (`W`: scene units per
 * linear unit, `s`: scaled units per linear unit). Vertices are stored in linear coordinates
 * (relative to a float64 origin), so the geometry depends on `W` and is rebuilt when the scene's
 * aspect or ranges change (not when the camera moves). Ring frames are carried along each tube by
 * parallel transport (no twist), where gl-streamtube3d orients each ring on its own.
 *
 * Normals are the rings' outward directions in scene units, handed to the mesh in data space
 * (`W ⊙ n`, which the mesh's normal matrix turns back into `n`).
 */
import type { StreamSet } from './integrate.ts';
import type { Vec3 } from '@mk7s/holochart-render';

/** Vertices per ring (gl-streamtube3d's `facets`). */
export const TUBE_FACETS = 8;

export interface TubeGeometry {
  /** Ring vertices, linear coordinates relative to `origin` ({@link TUBE_FACETS} per sample). */
  readonly positions: Float32Array;
  readonly origin: Vec3;
  /** Normals in data space (3 per vertex). */
  readonly normals: Float32Array;
  /** Three per triangle. */
  readonly indices: Uint32Array;
}

/** gl-streamtube3d's `getOrthogonalVector`: a unit vector across `t`. */
function orthogonal(t: Vec3): Vec3 {
  const [x, y, z] = t;
  if (x * x > z * z || y * y > z * z) {
    const l = Math.hypot(y, x) || 1;
    return [-y / l, x / l, 0];
  }
  const l = Math.hypot(z, y) || 1;
  return [0, z / l, -y / l];
}

/**
 * Build the tubes of `streams` (positions in scaled units, `scale` = `s`) with per-sample radii
 * (scaled units), for scene units per linear unit `world` (`W`). See the module comment.
 */
export function tubeGeometry(
  streams: Pick<StreamSet, 'offsets' | 'position' | 'velocity'>,
  radius: ArrayLike<number>,
  scale: Readonly<Vec3>,
  world: Readonly<Vec3>,
): TubeGeometry {
  const n = streams.position.length / 3;
  const pos = streams.position;
  const vel = streams.velocity;
  const origin: Vec3 = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = pos[i * 3 + a]! / scale[a]!;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    origin[a] = lo <= hi ? (lo + hi) / 2 : 0;
  }
  const positions = new Float32Array(n * TUBE_FACETS * 3);
  const normals = new Float32Array(n * TUBE_FACETS * 3);
  const cos = Array.from({ length: TUBE_FACETS }, (_, a) =>
    Math.cos((2 * Math.PI * a) / TUBE_FACETS),
  );
  const sin = Array.from({ length: TUBE_FACETS }, (_, a) =>
    Math.sin((2 * Math.PI * a) / TUBE_FACETS),
  );
  let triangles = 0;
  const tubes = streams.offsets.length - 1;
  for (let t = 0; t < tubes; t++) {
    const len = streams.offsets[t + 1]! - streams.offsets[t]!;
    if (len > 1) triangles += (len - 1) * TUBE_FACETS * 2;
  }
  const indices = new Uint32Array(triangles * 3);
  let k = 0;
  const center = (i: number, a: number) => pos[i * 3 + a]! / scale[a]!;
  for (let t = 0; t < tubes; t++) {
    const first = streams.offsets[t]!;
    const last = streams.offsets[t + 1]!;
    let e1: Vec3 | null = null;
    for (let i = first; i < last; i++) {
      // The flow direction in linear units: the vector, else the path.
      let d: Vec3 = [
        vel[i * 3]! / scale[0]!,
        vel[i * 3 + 1]! / scale[1]!,
        vel[i * 3 + 2]! / scale[2]!,
      ];
      if (!(d[0] || d[1] || d[2]) || !Number.isFinite(d[0] + d[1] + d[2])) {
        const a = i > first ? i - 1 : i;
        const b = i + 1 < last ? i + 1 : i;
        d = [0, 1, 2].map((c) => center(b, c) - center(a, c)) as Vec3;
      }
      const dw: Vec3 = [d[0] * world[0], d[1] * world[1], d[2] * world[2]];
      const lw = Math.hypot(...dw);
      const ls = Math.hypot(d[0] * scale[0], d[1] * scale[1], d[2] * scale[2]);
      const r = lw > 0 && ls > 0 && Number.isFinite(radius[i]!) ? (radius[i]! * lw) / ls : 0;
      const tan: Vec3 = lw > 0 ? [dw[0] / lw, dw[1] / lw, dw[2] / lw] : [0, 0, 1];
      // Parallel transport of the ring's first axis.
      if (e1) {
        const p = e1[0] * tan[0] + e1[1] * tan[1] + e1[2] * tan[2];
        const q: Vec3 = [e1[0] - p * tan[0], e1[1] - p * tan[1], e1[2] - p * tan[2]];
        const lq = Math.hypot(...q);
        e1 = lq > 1e-6 ? [q[0] / lq, q[1] / lq, q[2] / lq] : orthogonal(tan);
      } else e1 = orthogonal(tan);
      // e2 = e1 × tan (gl-streamtube3d's `cross(u, d)`).
      const e2: Vec3 = [
        e1[1] * tan[2] - e1[2] * tan[1],
        e1[2] * tan[0] - e1[0] * tan[2],
        e1[0] * tan[1] - e1[1] * tan[0],
      ];
      const c: Vec3 = [center(i, 0), center(i, 1), center(i, 2)];
      for (let a = 0; a < TUBE_FACETS; a++) {
        const o = (i * TUBE_FACETS + a) * 3;
        for (let m = 0; m < 3; m++) {
          const nw = cos[a]! * e1[m]! + sin[a]! * e2[m]!;
          positions[o + m] = c[m]! + (r * nw) / world[m]! - origin[m]!;
          normals[o + m] = nw * world[m]!;
        }
      }
      if (i > first) {
        const prev = (i - 1) * TUBE_FACETS;
        const cur = i * TUBE_FACETS;
        for (let a = 0; a < TUBE_FACETS; a++) {
          const a1 = (a + 1) % TUBE_FACETS;
          indices[k++] = prev + a;
          indices[k++] = cur + a;
          indices[k++] = cur + a1;
          indices[k++] = cur + a1;
          indices[k++] = prev + a1;
          indices[k++] = prev + a;
        }
      }
    }
  }
  return { positions, origin, normals, indices };
}
