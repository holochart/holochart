/**
 * Pure geometry and color helpers of the mesh primitive (plan E2.11), unit-tested without WebGL.
 *
 * ## Normals (Plotly's `normals` package, used by gl-mesh3d and gl-surface3d)
 *
 * - **Face normals**: `(b - a) × (c - a)`, unit length, or zero when its squared length is at most
 *   `facenormalsepsilon` (degenerate faces are then lit by the ambient light only).
 * - **Vertex normals**: every corner adds `(next - cur) × (prev - cur) / (|prev - cur| · |next -
 *   cur|)` (the face normal weighted by the sine of the corner angle) when `|prev - cur|² ·
 *   |next - cur|²` exceeds `vertexnormalsepsilon`; the sums are normalized, or zero when their
 *   squared length is at most the same epsilon.
 *
 * Plotly computes them in its scene space, where the data box is about unit-sized, so the
 * epsilons are relative to that. Positions are scaled by `normalScale` first (default: each axis'
 * extent mapped to 2, like Plotly's cube scene) and the normals are mapped back to data space
 * (`n_data ∝ S · n_scaled`), where `normalMatrix` takes them to view space.
 *
 * Triangles with a non-finite or hidden vertex (`|v| ≥ 1e38`, see `HIDDEN_POSITION`) are skipped
 * (and drawn degenerate by the primitive), as Plotly drops cells with missing vertices.
 */
import type { Vec3 } from '../precision.ts';
import type { ColorInput } from '../types.ts';
import { colorAt } from './common.ts';

/** Triangle indices: three per triangle. */
export type MeshIndexArray = Uint32Array | Uint16Array;

/** Plotly's `lighting.facenormalsepsilon` default. */
export const DEFAULT_FACE_NORMALS_EPSILON = 1e-6;
/** Plotly's `lighting.vertexnormalsepsilon` default. */
export const DEFAULT_VERTEX_NORMALS_EPSILON = 1e-12;
/** Intensities that are not finite are written as this and discarded by the shader. */
export const HIDDEN_INTENSITY = 3.0e38;

const HIDDEN = 1e38;

/** Number of triangles: `indices.length / 3`, or `vertexCount / 3` without indices. */
export function meshTriangleCount(vertexCount: number, indices: ArrayLike<number> | null): number {
  return Math.floor((indices ? indices.length : vertexCount) / 3);
}

/** Vertex of corner `k` (triangle `floor(k / 3)`). */
export function cornerVertex(indices: ArrayLike<number> | null, k: number): number {
  return indices ? indices[k]! : k;
}

/** Whether vertex `v` has finite, visible coordinates (and exists). */
export function isValidVertex(positions: ArrayLike<number>, v: number): boolean {
  const i = v * 3;
  if (!(v >= 0) || i + 2 >= positions.length) return false;
  for (let c = 0; c < 3; c++) {
    const p = positions[i + c]!;
    if (!(Math.abs(p) < HIDDEN)) return false;
  }
  return true;
}

/** Whether all three vertices of triangle `t` are valid. */
export function isValidTriangle(
  positions: ArrayLike<number>,
  indices: ArrayLike<number> | null,
  t: number,
): boolean {
  const k = t * 3;
  return (
    isValidVertex(positions, cornerVertex(indices, k)) &&
    isValidVertex(positions, cornerVertex(indices, k + 1)) &&
    isValidVertex(positions, cornerVertex(indices, k + 2))
  );
}

/**
 * Default normal scale: each axis' finite extent mapped to 2 (Plotly's scene cube), 1 for flat or
 * empty axes.
 */
export function defaultNormalScale(positions: ArrayLike<number>): Vec3 {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < positions.length; i += 3) {
    if (!isValidVertex(positions, i / 3)) continue;
    for (let c = 0; c < 3; c++) {
      const p = positions[i + c]!;
      if (p < min[c]!) min[c] = p;
      if (p > max[c]!) max[c] = p;
    }
  }
  const s: Vec3 = [1, 1, 1];
  for (let c = 0; c < 3; c++) {
    const e = max[c]! - min[c]!;
    if (e > 0 && Number.isFinite(e)) s[c] = 2 / e;
  }
  return s;
}

/** Normalize `out[i..i+3)` in place when its squared length exceeds `eps`, else zero it. */
function normalizeAt(out: Float32Array, i: number, x: number, y: number, z: number, eps: number) {
  const m = x * x + y * y + z * z;
  const w = m > eps ? 1 / Math.sqrt(m) : 0;
  out[i] = x * w;
  out[i + 1] = y * w;
  out[i + 2] = z * w;
}

/**
 * Plotly's face normals, one per triangle (`3 * triangleCount` floats), in data space. See the
 * module comment for `epsilon` and `scale`.
 */
export function computeFaceNormals(
  positions: ArrayLike<number>,
  indices: ArrayLike<number> | null,
  epsilon = DEFAULT_FACE_NORMALS_EPSILON,
  scale: Readonly<Vec3> = [1, 1, 1],
  out?: Float32Array,
): Float32Array {
  const count = meshTriangleCount(positions.length / 3, indices);
  const normals = out ?? new Float32Array(count * 3);
  const [sx, sy, sz] = scale;
  for (let t = 0; t < count; t++) {
    const o = t * 3;
    if (!isValidTriangle(positions, indices, t)) {
      normals[o] = normals[o + 1] = normals[o + 2] = 0;
      continue;
    }
    const a = cornerVertex(indices, o) * 3;
    const b = cornerVertex(indices, o + 1) * 3;
    const c = cornerVertex(indices, o + 2) * 3;
    const ux = (positions[b]! - positions[a]!) * sx;
    const uy = (positions[b + 1]! - positions[a + 1]!) * sy;
    const uz = (positions[b + 2]! - positions[a + 2]!) * sz;
    const vx = (positions[c]! - positions[a]!) * sx;
    const vy = (positions[c + 1]! - positions[a + 1]!) * sy;
    const vz = (positions[c + 2]! - positions[a + 2]!) * sz;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    if (!(nx * nx + ny * ny + nz * nz > epsilon)) {
      normals[o] = normals[o + 1] = normals[o + 2] = 0;
      continue;
    }
    // Back to data space: n_data ∝ S · n_scaled.
    normalizeAt(normals, o, nx * sx, ny * sy, nz * sz, 0);
  }
  return normals;
}

/**
 * Plotly's angle-weighted vertex normals, one per vertex (`positions.length` floats), in data
 * space. See the module comment for `epsilon` and `scale`.
 */
export function computeVertexNormals(
  positions: ArrayLike<number>,
  indices: ArrayLike<number> | null,
  epsilon = DEFAULT_VERTEX_NORMALS_EPSILON,
  scale: Readonly<Vec3> = [1, 1, 1],
  out?: Float32Array,
): Float32Array {
  const vertexCount = Math.floor(positions.length / 3);
  const sums = new Float64Array(vertexCount * 3);
  const count = meshTriangleCount(vertexCount, indices);
  const [sx, sy, sz] = scale;
  for (let t = 0; t < count; t++) {
    if (!isValidTriangle(positions, indices, t)) continue;
    for (let j = 0; j < 3; j++) {
      const p = cornerVertex(indices, t * 3 + ((j + 2) % 3)) * 3;
      const c = cornerVertex(indices, t * 3 + j) * 3;
      const n = cornerVertex(indices, t * 3 + ((j + 1) % 3)) * 3;
      const ax = (positions[p]! - positions[c]!) * sx;
      const ay = (positions[p + 1]! - positions[c + 1]!) * sy;
      const az = (positions[p + 2]! - positions[c + 2]!) * sz;
      const bx = (positions[n]! - positions[c]!) * sx;
      const by = (positions[n + 1]! - positions[c + 1]!) * sy;
      const bz = (positions[n + 2]! - positions[c + 2]!) * sz;
      const m = (ax * ax + ay * ay + az * az) * (bx * bx + by * by + bz * bz);
      if (!(m > epsilon)) continue;
      const w = 1 / Math.sqrt(m);
      // (next - cur) × (prev - cur)
      sums[c]! += w * (by * az - bz * ay);
      sums[c + 1]! += w * (bz * ax - bx * az);
      sums[c + 2]! += w * (bx * ay - by * ax);
    }
  }
  const normals = out ?? new Float32Array(vertexCount * 3);
  for (let v = 0; v < vertexCount; v++) {
    const i = v * 3;
    const x = sums[i]!;
    const y = sums[i + 1]!;
    const z = sums[i + 2]!;
    if (!(x * x + y * y + z * z > epsilon)) {
      normals[i] = normals[i + 1] = normals[i + 2] = 0;
      continue;
    }
    normalizeAt(normals, i, x * sx, y * sy, z * sz, 0);
  }
  return normals;
}

/**
 * Where a mesh's colors come from, in Plotly's precedence (mesh3d `convert.js`): `intensity`
 * (per vertex or per cell), then per-vertex colors, then per-face colors, then one color.
 */
export type MeshColorSource = 'intensity-vertex' | 'intensity-cell' | 'vertex' | 'face' | 'uniform';

export function meshColorSource(d: {
  intensity?: ArrayLike<number> | null;
  intensityMode?: 'vertex' | 'cell';
  color?: ColorInput;
  faceColor?: Float32Array | null;
}): MeshColorSource {
  if (d.intensity) return d.intensityMode === 'cell' ? 'intensity-cell' : 'intensity-vertex';
  if (d.color instanceof Float32Array) return 'vertex';
  if (d.faceColor) return 'face';
  return 'uniform';
}

/** sRGB → linear (three.js materials expect linear vertex colors). */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * The attribute layout the primitive draws: `expanded` geometry has three vertices per triangle
 * (flat shading, per-cell colors or intensity, triangle picking); otherwise the input vertices are
 * drawn through the index.
 */
export interface MeshLayout {
  expanded: boolean;
  /** Input vertices. */
  vertexCount: number;
  triangleCount: number;
  /** Drawn vertices: `3 * triangleCount` when expanded, else `vertexCount`. */
  itemCount: number;
  indices: ArrayLike<number> | null;
}

/** Input vertex of drawn item `i`. */
export function itemVertex(layout: MeshLayout, i: number): number {
  return layout.expanded ? cornerVertex(layout.indices, i) : i;
}

/**
 * Copy per-vertex values (`size` floats per vertex) to drawn items, e.g. positions or normals of
 * expanded geometry.
 */
export function gatherVertices(
  src: ArrayLike<number>,
  size: number,
  layout: MeshLayout,
  out: Float32Array = new Float32Array(layout.itemCount * size),
): Float32Array {
  for (let i = 0; i < layout.itemCount; i++) {
    const v = itemVertex(layout, i) * size;
    for (let c = 0; c < size; c++) out[i * size + c] = src[v + c] ?? 0;
  }
  return out;
}

/**
 * Per-item intensity relative to `origin` (float32 keeps precision for values with a large common
 * offset): per vertex, or per triangle (`'cell'`, expanded layouts). Non-finite and missing values
 * become {@link HIDDEN_INTENSITY}.
 */
export function writeIntensity(
  intensity: ArrayLike<number>,
  cell: boolean,
  origin: number,
  layout: MeshLayout,
  out: Float32Array = new Float32Array(layout.itemCount),
): Float32Array {
  for (let i = 0; i < layout.itemCount; i++) {
    const j = cell ? Math.floor(i / 3) : itemVertex(layout, i);
    const v = j < intensity.length ? intensity[j]! : NaN;
    out[i] = Number.isFinite(v) ? v - origin : HIDDEN_INTENSITY;
  }
  return out;
}

/** Center of the finite range of `values` (0 when none): the intensity origin. */
export function intensityOrigin(values: ArrayLike<number>): number {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v < min && v > -Infinity) min = v;
    if (v > max && v < Infinity) max = v;
  }
  return min <= max ? (min + max) / 2 : 0;
}

/** Inputs of {@link writeColors}. */
export interface MeshColorInputs {
  source: MeshColorSource;
  color: ColorInput;
  faceColor: Float32Array | null;
  alpha: ArrayLike<number> | null;
  intensity: ArrayLike<number> | null;
  /**
   * For three.js materials (`linear: true`): intensity is mapped on the CPU through this 256-texel
   * RGBA8 LUT, with `domain = [cmin, cmax]` and `reverse`.
   */
  lut?: Uint8Array;
  domain?: readonly [number, number];
  reverse?: boolean;
  /** Write linear colors (three.js materials) instead of sRGB (the Plotly shader). */
  linear?: boolean;
}

/**
 * Whether the drawn items need a per-item color attribute: always for per-vertex / per-face colors
 * and for intensity mapped on the CPU (three.js materials); for one color, or intensity in the
 * shader, only to carry per-vertex `alpha`.
 */
export function needsColorAttribute(c: Pick<MeshColorInputs, 'source' | 'alpha' | 'linear'>) {
  if (c.source === 'vertex' || c.source === 'face') return true;
  if (c.source !== 'uniform' && c.linear) return true;
  return c.alpha !== null;
}

const scratch = [0, 0, 0, 0];

/**
 * Per-item RGBA colors (straight alpha, per-vertex `alpha` multiplied in). In the Plotly shader's
 * intensity mode the RGB is unused (white) and only alpha is carried.
 */
export function writeColors(
  c: MeshColorInputs,
  layout: MeshLayout,
  out: Float32Array = new Float32Array(layout.itemCount * 4),
): Float32Array {
  const cpuIntensity = c.linear === true && c.source.startsWith('intensity');
  const [lo, hi] = c.domain ?? [0, 1];
  const span = hi - lo || 1;
  for (let i = 0; i < layout.itemCount; i++) {
    const v = itemVertex(layout, i);
    const cell = Math.floor(i / 3);
    const rgba = scratch;
    if (c.source === 'vertex') colorAt(c.color, v, rgba);
    else if (c.source === 'face') colorAt(c.faceColor!, cell, rgba);
    else if (cpuIntensity && c.intensity && c.lut) {
      const j = c.source === 'intensity-cell' ? cell : v;
      const value = j < c.intensity.length ? c.intensity[j]! : NaN;
      if (Number.isFinite(value)) {
        let t = Math.min(1, Math.max(0, (value - lo) / span));
        if (c.reverse) t = 1 - t;
        const x = t * 255;
        const i0 = Math.floor(x);
        const i1 = Math.min(255, i0 + 1);
        const f = x - i0;
        for (let k = 0; k < 4; k++) {
          rgba[k] = (c.lut[i0 * 4 + k]! * (1 - f) + c.lut[i1 * 4 + k]! * f) / 255;
        }
      } else rgba[0] = rgba[1] = rgba[2] = rgba[3] = 0;
    } else if (c.source === 'uniform') colorAt(c.color, 0, rgba);
    else rgba[0] = rgba[1] = rgba[2] = rgba[3] = 1;
    const a = c.alpha ? (v < c.alpha.length ? c.alpha[v]! : 1) : 1;
    const o = i * 4;
    for (let k = 0; k < 3; k++) out[o + k] = c.linear ? srgbToLinear(rgba[k]!) : rgba[k]!;
    out[o + 3] = rgba[3]! * (Number.isFinite(a) ? a : 1);
  }
  return out;
}

/** Whether any drawn color is translucent (alpha < 1). */
export function hasTranslucency(colors: Float32Array | null, fallbackAlpha: number): boolean {
  if (!colors) return fallbackAlpha < 1;
  for (let i = 3; i < colors.length; i += 4) if (colors[i]! < 1) return true;
  return false;
}
