/**
 * Tube and ribbon geometry of `scatter3d` lines (plan E14.10, a Holochart extension:
 * `line.render: 'tube' | 'ribbon'`). Pure: points in, indexed triangle meshes out, all in scene
 * units (world), so tubes stay round and ribbons flat whatever the axis scales; the view rebuilds
 * them when the scene's transform changes (a layout pass, not a camera move).
 *
 * - **Runs**: the polyline splits at missing points (NaN) into runs, unless `connectGaps` (then
 *   missing points are skipped). Runs of one point draw nothing.
 * - **Tubes** ({@link tubeMesh}): a ring of `segments` vertices around every point, in a
 *   rotation-minimizing frame carried along the curve by the double reflection method (Wang et
 *   al. 2008: parallel transport without twisting, exact for circles and helices up to sampling),
 *   smooth normals (the ring's radial directions), quads between successive rings and flat caps at
 *   the ends of every run. Per-point colors apply to their ring.
 * - **Ribbons** ({@link ribbonMesh}): a strip swept along one axis direction (`line.ribbon.axis`):
 *   two vertices per point, at `± halfWidth` along that axis, with the strip's normal
 *   `tangent × axis` (two-sided lighting), as MATLAB's `ribbon` and waterfall plots of spectra.
 * - **Picking**: `pointIndex[v]` maps every vertex to its data point, so a hit on the mesh hovers
 *   the point it was built around.
 */
import type { RGBA } from '@mk7s/holochart-render';

type Vec3 = [number, number, number];

/** An indexed triangle mesh in world units, relative to `origin`. */
export interface LineMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** sRGB RGBA per vertex. */
  colors: Float32Array;
  /** Data point of every vertex. */
  pointIndex: Int32Array;
  origin: Vec3;
}

/** The points of a `scatter3d` line in world units and their colors. */
export interface LineMeshInput {
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  z: ArrayLike<number>;
  /** One color, or 4 floats per point (sRGB, straight alpha). */
  color: RGBA | Float32Array;
  connectGaps: boolean;
}

/** Runs of finite points: arrays of data indices (see the module comment). */
export function lineRuns(input: Omit<LineMeshInput, 'color'>): number[][] {
  const n = Math.min(input.x.length, input.y.length, input.z.length);
  const runs: number[][] = [];
  let run: number[] = [];
  for (let i = 0; i < n; i++) {
    const ok =
      Number.isFinite(input.x[i]!) && Number.isFinite(input.y[i]!) && Number.isFinite(input.z[i]!);
    if (ok) run.push(i);
    else if (!input.connectGaps && run.length > 0) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length > 0) runs.push(run);
  return runs.filter((r) => r.length > 1);
}

const sub = (a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Readonly<Vec3>, b: Readonly<Vec3>): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function normalize(a: Readonly<Vec3>, fallback: Readonly<Vec3>): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [fallback[0], fallback[1], fallback[2]];
}
/** `a − (2 / c) (v · a) v`: the reflection of `a` in the plane normal to `v` (`c = v · v`). */
function reflect(a: Readonly<Vec3>, v: Readonly<Vec3>, c: number): Vec3 {
  const k = (2 / c) * dot(v, a);
  return [a[0] - k * v[0], a[1] - k * v[1], a[2] - k * v[2]];
}

/** Unit tangents of a run: central differences, one-sided at the ends. */
export function runTangents(points: readonly Vec3[]): Vec3[] {
  const n = points.length;
  const out: Vec3[] = [];
  let last: Vec3 = [1, 0, 0];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)]!;
    const b = points[Math.min(n - 1, i + 1)]!;
    last = normalize(sub(b, a), last);
    out.push(last);
  }
  return out;
}

/** A unit vector perpendicular to `t` (along the axis least aligned with it). */
export function perpendicular(t: Readonly<Vec3>): Vec3 {
  const ax = Math.abs(t[0]);
  const ay = Math.abs(t[1]);
  const az = Math.abs(t[2]);
  const e: Vec3 = ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1];
  return normalize(cross(t, e), [0, 0, 1]);
}

/**
 * Rotation-minimizing normals along a run (the double reflection method): `normals[i]` is a unit
 * vector perpendicular to `tangents[i]`, transported from the first without twisting.
 */
export function transportFrames(points: readonly Vec3[], tangents: readonly Vec3[]): Vec3[] {
  const n = points.length;
  if (n === 0) return [];
  const out: Vec3[] = [perpendicular(tangents[0]!)];
  for (let i = 0; i + 1 < n; i++) {
    const r = out[i]!;
    const t = tangents[i]!;
    const v1 = sub(points[i + 1]!, points[i]!);
    const c1 = dot(v1, v1);
    let next: Vec3;
    if (!(c1 > 1e-24)) next = r;
    else {
      const rL = reflect(r, v1, c1);
      const tL = reflect(t, v1, c1);
      const v2 = sub(tangents[i + 1]!, tL);
      const c2 = dot(v2, v2);
      next = c2 > 1e-24 ? reflect(rL, v2, c2) : rL;
    }
    // Re-orthogonalize against rounding.
    const t1 = tangents[i + 1]!;
    const k = dot(next, t1);
    out.push(
      normalize([next[0] - k * t1[0], next[1] - k * t1[1], next[2] - k * t1[2]], perpendicular(t1)),
    );
  }
  return out;
}

/** Growable typed buffers of a mesh under construction. */
class Builder {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  points: number[] = [];
  indices: number[] = [];
  vertex(p: Readonly<Vec3>, n: Readonly<Vec3>, c: ArrayLike<number>, point: number): number {
    this.positions.push(p[0], p[1], p[2]);
    this.normals.push(n[0], n[1], n[2]);
    this.colors.push(c[0]!, c[1]!, c[2]!, c[3]!);
    this.points.push(point);
    return this.points.length - 1;
  }
  build(): LineMesh {
    const n = this.points.length;
    const lo: Vec3 = [Infinity, Infinity, Infinity];
    const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) {
        const v = this.positions[i * 3 + k]!;
        if (v < lo[k]!) lo[k] = v;
        if (v > hi[k]!) hi[k] = v;
      }
    }
    const origin: Vec3 = n > 0 ? ([0, 1, 2].map((k) => (lo[k]! + hi[k]!) / 2) as Vec3) : [0, 0, 0];
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) positions[i] = this.positions[i]! - origin[i % 3]!;
    return {
      positions,
      normals: Float32Array.from(this.normals),
      indices: Uint32Array.from(this.indices),
      colors: Float32Array.from(this.colors),
      pointIndex: Int32Array.from(this.points),
      origin,
    };
  }
}

function colorOf(color: RGBA | Float32Array, i: number): ArrayLike<number> {
  return color instanceof Float32Array ? color.subarray(i * 4, i * 4 + 4) : color;
}

function runPoints(input: LineMeshInput, run: readonly number[]): Vec3[] {
  return run.map((i) => [input.x[i]!, input.y[i]!, input.z[i]!]);
}

/** Tubes of radius `radius` (world units) around every run (see the module comment). */
export function tubeMesh(input: LineMeshInput, radius: number, segments = 12): LineMesh {
  const b = new Builder();
  const s = Math.max(3, Math.round(segments));
  for (const run of lineRuns(input)) {
    const points = runPoints(input, run);
    const tangents = runTangents(points);
    const frames = transportFrames(points, tangents);
    const first = b.points.length;
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      const nrm = frames[i]!;
      const bin = cross(tangents[i]!, nrm);
      const c = colorOf(input.color, run[i]!);
      for (let k = 0; k < s; k++) {
        const a = (2 * Math.PI * k) / s;
        const d: Vec3 = [0, 1, 2].map((j) => Math.cos(a) * nrm[j]! + Math.sin(a) * bin[j]!) as Vec3;
        b.vertex([p[0] + radius * d[0], p[1] + radius * d[1], p[2] + radius * d[2]], d, c, run[i]!);
      }
    }
    for (let i = 0; i + 1 < points.length; i++) {
      const r0 = first + i * s;
      const r1 = r0 + s;
      for (let k = 0; k < s; k++) {
        const k1 = (k + 1) % s;
        // Counter-clockwise seen from outside (the frame (n, b, t) is right-handed).
        b.indices.push(r0 + k, r0 + k1, r1 + k, r1 + k, r0 + k1, r1 + k1);
      }
    }
    // Flat caps.
    for (const end of [0, points.length - 1]) {
      const t = tangents[end]!;
      const out: Vec3 = end === 0 ? [-t[0], -t[1], -t[2]] : t;
      const c = colorOf(input.color, run[end]!);
      const center = b.vertex(points[end]!, out, c, run[end]!);
      const ring: number[] = [];
      for (let k = 0; k < s; k++) {
        const v = first + end * s + k;
        const p = b.positions.slice(v * 3, v * 3 + 3) as Vec3;
        ring.push(b.vertex(p, out, c, run[end]!));
      }
      for (let k = 0; k < s; k++) {
        const a = ring[k]!;
        const bb = ring[(k + 1) % s]!;
        if (end === 0) b.indices.push(center, bb, a);
        else b.indices.push(center, a, bb);
      }
    }
  }
  return b.build();
}

/**
 * Ribbons swept along world axis `axis` (0 x, 1 y, 2 z) by `± halfWidth` (world units) around
 * every run (see the module comment).
 */
export function ribbonMesh(input: LineMeshInput, axis: 0 | 1 | 2, halfWidth: number): LineMesh {
  const b = new Builder();
  const e: Vec3 = [0, 0, 0];
  e[axis] = 1;
  for (const run of lineRuns(input)) {
    const points = runPoints(input, run);
    const tangents = runTangents(points);
    const first = b.points.length;
    let last: Vec3 = perpendicular(e);
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      last = normalize(cross(tangents[i]!, e), last);
      const c = colorOf(input.color, run[i]!);
      for (const side of [-1, 1]) {
        const q: Vec3 = [p[0], p[1], p[2]];
        q[axis] += side * halfWidth;
        b.vertex(q, last, c, run[i]!);
      }
    }
    for (let i = 0; i + 1 < points.length; i++) {
      const v = first + i * 2;
      b.indices.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
  }
  return b.build();
}
