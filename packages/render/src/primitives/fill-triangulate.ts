/**
 * CPU-side triangulation and batching for the fill primitive (plan E2.6). Pure functions, no WebGL.
 *
 * ## Input layout (choropleth / treemap scale)
 *
 * All polygons of a primitive share flat coordinate arrays. Two offset tables describe structure
 * without per-polygon objects:
 *
 * ```
 * x, y (, z)   vertex coordinates (Float64Array preferred)
 * rings        start vertex of each ring           [r0, r1, r2, ...]   (omitted: one ring)
 * polygons     first ring of each polygon          [p0, p1, ...]       (omitted: one ring each)
 * ```
 *
 * Within a polygon the first ring is the outer boundary and the rest are holes (GeoJSON order;
 * ring orientation is ignored by the default `'simple'` rule). A closing vertex equal to the first
 * is allowed but not required. Non-finite vertices are skipped.
 *
 * ## Output layout
 *
 * One merged indexed triangle list for all polygons (one draw call). `vertexStarts[p]` ..
 * `vertexStarts[p + 1]` are the output vertices of polygon `p`, so per-polygon attributes (color,
 * later gradient/pattern parameters) can be rewritten without re-triangulating.
 */
import earcut from 'earcut';
import type { ColorInput } from '../types.ts';
import { colorAt, type NumericArray, type Vec3 } from './common.ts';
import { triangulateArrangement } from './fill-arrangement.ts';

/**
 * How rings combine into a filled region.
 *
 * - `'simple'` (default): earcut fast path. First ring outer, others holes; rings are assumed
 *   simple and non-overlapping (GeoJSON / shapefile semantics). Use for choropleths, treemaps,
 *   stacked areas, shapes. Self-intersecting rings give undefined (but bounded) output.
 * - `'evenodd'`: exact even-odd rule over all rings of the polygon, including self-intersecting
 *   and overlapping rings (Plotly "toself" pentagram → hollow center). CPU planar arrangement;
 *   see `fill-arrangement.ts` for cost and limits.
 * - `'nonzero'`: exact nonzero-winding rule (SVG default); same machinery as `'evenodd'`. Holes
 *   must be wound opposite to their outer ring to be cut.
 */
export type FillRule = 'simple' | 'evenodd' | 'nonzero';

/** Geometry-affecting fill inputs (changing any of these re-triangulates). */
export interface FillGeometryInput {
  x: NumericArray;
  y: NumericArray;
  /** Optional z for 3D fills (world-space positions; each polygon should be planar). */
  z?: NumericArray;
  /** Start vertex of each ring, ascending. Omitted: all vertices form a single ring. */
  rings?: ArrayLike<number>;
  /** First ring index of each polygon, ascending. Omitted: every ring is its own polygon. */
  polygons?: ArrayLike<number>;
  /** Default `'simple'`. */
  fillRule?: FillRule;
}

/** Result of {@link triangulateFills}. */
export interface FillTriangulation {
  /** Number of polygons (items for per-polygon attributes such as color). */
  polygonCount: number;
  /** Output vertex count. */
  vertexCount: number;
  /** Absolute (not RTC) float64 positions, xyz per vertex (z = 0 for 2D input). */
  positions: Float64Array;
  /** Triangle list into `positions`. */
  indices: Uint32Array;
  /** Output vertex range of each polygon (length `polygonCount + 1`). */
  vertexStarts: Uint32Array;
  /** Index range of each polygon's triangles (length `polygonCount + 1`), e.g. for picking. */
  indexStarts: Uint32Array;
}

/** Resolved polygon → vertex/ring structure (shared by the triangulation paths). */
interface Structure {
  n: number;
  ringStart: (r: number) => number;
  ringEnd: (r: number) => number;
  polygonCount: number;
  polygonRings: (p: number) => [number, number];
}

function resolveStructure(input: FillGeometryInput): Structure {
  let n = Math.min(input.x.length, input.y.length);
  if (input.z) n = Math.min(n, input.z.length);
  const rings = input.rings;
  const ringCount = rings && rings.length > 0 ? rings.length : 1;
  const clampV = (v: number): number => Math.max(0, Math.min(n, Math.floor(v)));
  const ringStart = (r: number): number => (rings && rings.length > 0 ? clampV(rings[r]!) : 0);
  const ringEnd = (r: number): number => (r + 1 < ringCount ? ringStart(r + 1) : n);
  const polygons = input.polygons;
  const polygonCount = polygons ? polygons.length : ringCount;
  const clampR = (r: number): number => Math.max(0, Math.min(ringCount, Math.floor(r)));
  const polygonRings = (p: number): [number, number] => {
    if (!polygons) return [p, p + 1];
    const start = clampR(polygons[p]!);
    const end = p + 1 < polygonCount ? clampR(polygons[p + 1]!) : ringCount;
    return [start, Math.max(start, end)];
  };
  return { n, ringStart, ringEnd, polygonCount, polygonRings };
}

/** Growable float64 / uint32 buffers (avoid boxed number[] for choropleth-scale batches). */
class F64Builder {
  data: Float64Array;
  length = 0;
  constructor(capacity: number) {
    this.data = new Float64Array(Math.max(16, capacity));
  }
  reserve(extra: number): void {
    if (this.length + extra <= this.data.length) return;
    const next = new Float64Array(Math.max(this.length + extra, this.data.length * 2));
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }
  finish(): Float64Array {
    return this.data.slice(0, this.length);
  }
}

class U32Builder {
  data: Uint32Array;
  length = 0;
  constructor(capacity: number) {
    this.data = new Uint32Array(Math.max(16, capacity));
  }
  reserve(extra: number): void {
    if (this.length + extra <= this.data.length) return;
    const next = new Uint32Array(Math.max(this.length + extra, this.data.length * 2));
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }
  finish(): Uint32Array {
    return this.data.slice(0, this.length);
  }
}

/**
 * Choose the two axes to triangulate a (possibly 3D) planar polygon in: the axis most aligned with
 * the Newell normal is dropped, so vertical fills in 3D (e.g. an area in the x–z plane) do not
 * collapse. Returns `[0, 1]` (x, y) for 2D input or degenerate normals.
 */
export function fillProjectionAxes(xyz: ArrayLike<number>, count: number): [number, number] {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const x0 = xyz[3 * i]!;
    const y0 = xyz[3 * i + 1]!;
    const z0 = xyz[3 * i + 2]!;
    const x1 = xyz[3 * j]!;
    const y1 = xyz[3 * j + 1]!;
    const z1 = xyz[3 * j + 2]!;
    nx += (y0 - y1) * (z0 + z1);
    ny += (z0 - z1) * (x0 + x1);
    nz += (x0 - x1) * (y0 + y1);
  }
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  if (az >= ax && az >= ay) return [0, 1];
  if (ax >= ay) return [1, 2];
  return [2, 0];
}

/**
 * Triangulate every polygon and merge the result into one indexed triangle list.
 * `origin` (optional) is subtracted from coordinates before triangulating, which keeps earcut's
 * cross products well conditioned for large values such as ms timestamps; output positions are
 * absolute either way.
 */
export function triangulateFills(
  input: FillGeometryInput,
  origin: Readonly<Vec3> = [0, 0, 0],
): FillTriangulation {
  const s = resolveStructure(input);
  const rule = input.fillRule ?? 'simple';
  const { x, y, z } = input;
  const positions = new F64Builder(s.n * 3);
  const indices = new U32Builder(s.n * 3);
  const vertexStarts = new Uint32Array(s.polygonCount + 1);
  const indexStarts = new Uint32Array(s.polygonCount + 1);

  // Per-polygon scratch: local xyz (relative to origin) and ring starts of finite vertices.
  let local = new Float64Array(64);
  const ringStarts: number[] = [];
  let uv = new Float64Array(64);

  for (let p = 0; p < s.polygonCount; p++) {
    vertexStarts[p] = positions.length / 3;
    indexStarts[p] = indices.length;
    const [r0, r1] = s.polygonRings(p);

    // Gather finite vertices, ring by ring. Rings with < 3 vertices cannot enclose area.
    ringStarts.length = 0;
    let count = 0;
    for (let r = r0; r < r1; r++) {
      const start = s.ringStart(r);
      const end = s.ringEnd(r);
      const ringBegin = count;
      if (local.length < (count + Math.max(0, end - start)) * 3) {
        const next = new Float64Array(Math.max(local.length * 2, (count + end - start) * 3));
        next.set(local.subarray(0, count * 3));
        local = next;
      }
      for (let i = start; i < end; i++) {
        const vx = x[i]!;
        const vy = y[i]!;
        const vz = z ? z[i]! : 0;
        if (!Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(vz)) continue;
        local[3 * count] = vx - origin[0];
        local[3 * count + 1] = vy - origin[1];
        local[3 * count + 2] = vz - origin[2];
        count++;
      }
      if (count - ringBegin < 3) {
        count = ringBegin;
        // Simple rule: a degenerate outer ring leaves nothing to cut holes from.
        if (rule === 'simple' && r === r0) break;
        continue;
      }
      ringStarts.push(ringBegin);
    }
    if (count < 3) continue;

    const [ia, ib] = z ? fillProjectionAxes(local, ringEnd0(ringStarts, count)) : [0, 1];
    if (uv.length < count * 2) uv = new Float64Array(count * 2);
    for (let i = 0; i < count; i++) {
      uv[2 * i] = local[3 * i + ia]!;
      uv[2 * i + 1] = local[3 * i + ib]!;
    }

    const base = positions.length / 3;
    if (rule === 'simple') {
      const holes = ringStarts.length > 1 ? ringStarts.slice(1) : null;
      const tris = earcut(uv.subarray(0, count * 2), holes, 2);
      positions.reserve(count * 3);
      for (let i = 0; i < count; i++) {
        positions.data[positions.length++] = local[3 * i]! + origin[0];
        positions.data[positions.length++] = local[3 * i + 1]! + origin[1];
        positions.data[positions.length++] = local[3 * i + 2]! + origin[2];
      }
      indices.reserve(tris.length);
      for (const t of tris) indices.data[indices.length++] = base + t;
    } else {
      const result = triangulateArrangement(
        { uv: uv.subarray(0, count * 2), xyz: local.subarray(0, count * 3), ringStarts },
        rule,
      );
      if (result.triangles.length === 0) continue;
      const vcount = result.xyz.length / 3;
      positions.reserve(vcount * 3);
      for (let i = 0; i < vcount; i++) {
        positions.data[positions.length++] = result.xyz[3 * i]! + origin[0];
        positions.data[positions.length++] = result.xyz[3 * i + 1]! + origin[1];
        positions.data[positions.length++] = result.xyz[3 * i + 2]! + origin[2];
      }
      indices.reserve(result.triangles.length);
      for (const t of result.triangles) indices.data[indices.length++] = base + t;
    }
  }
  vertexStarts[s.polygonCount] = positions.length / 3;
  indexStarts[s.polygonCount] = indices.length;

  return {
    polygonCount: s.polygonCount,
    vertexCount: positions.length / 3,
    positions: positions.finish(),
    indices: indices.finish(),
    vertexStarts,
    indexStarts,
  };
}

/** Vertex count of the first (outer) ring: the Newell normal is taken from it. */
function ringEnd0(ringStarts: number[], count: number): number {
  return ringStarts.length > 1 ? ringStarts[1]! : count;
}

/**
 * Write RTC float32 positions (`position - origin`, xyz per vertex) for the GPU (plan §E16.4).
 * `out` is reused when it is large enough.
 */
export function encodeFillPositions(
  positions: Float64Array,
  origin: Readonly<Vec3>,
  out?: Float32Array,
): Float32Array {
  const target = out && out.length >= positions.length ? out : new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    target[i] = positions[i]! - origin[0];
    target[i + 1] = positions[i + 1]! - origin[1];
    target[i + 2] = positions[i + 2]! - origin[2];
  }
  return target;
}

/**
 * Expand per-polygon colors to per-vertex RGBA (4 floats per vertex) using the triangulation's
 * `vertexStarts`. This is the whole cost of a color-only update: no re-triangulation.
 */
export function writeFillColors(
  color: ColorInput,
  vertexStarts: Uint32Array,
  out?: Float32Array,
): Float32Array {
  const polygonCount = vertexStarts.length - 1;
  const vertexCount = polygonCount >= 0 ? vertexStarts[polygonCount]! : 0;
  const target =
    out && out.length >= vertexCount * 4 ? out : new Float32Array(Math.max(0, vertexCount * 4));
  const rgba = new Float32Array(4);
  for (let p = 0; p < polygonCount; p++) {
    const v0 = vertexStarts[p]!;
    const v1 = vertexStarts[p + 1]!;
    if (v1 === v0) continue;
    colorAt(color, p, rgba);
    for (let v = v0; v < v1; v++) target.set(rgba, v * 4);
  }
  return target;
}
