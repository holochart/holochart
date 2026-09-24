/**
 * Heatmap primitive: a z grid drawn as ONE textured quad with the colorscale LUT (plan: histogram2d
 * now, heatmap / contour fills in M4).
 *
 * ## Design
 *
 * - **Geometry**: the shared unit quad (like `image.ts`), stretched in the vertex shader over the
 *   edge extent `[xEdges[0], xEdges[nx]] × [yEdges[0], yEdges[ny]]`. The RTC origin is the first
 *   edge of each axis, so the shader only sees small relative coordinates (ADR-008).
 * - **Values**: one `RG32F` texture (`RGFormat` + `FloatType`, nearest) packed *linearly*: cell
 *   `k = j * nx + i` is texel `(k % W, floor(k / W))` with `W = min(nx * ny, 4096)`, so any `nx`
 *   fits regardless of the max texture size. Texels hold `(value - zOrigin, valid)`: non-finite
 *   values (NaN, ±Infinity) are stored as `(0, 0)` and drawn transparent. A separate validity channel
 *   avoids GLSL `isnan`, which some compilers optimize away. `zOrigin` (the center of the finite z
 *   range) keeps float32 precision for values with a large common offset; zmin / zmax go to the
 *   shader relative to it, computed in float64.
 * - **Edges**: one `R32F` texture with the same packing: x edges at texels `[0, nx]`, y edges at
 *   `[nx + 1, nx + ny + 1]`. Edges are stored *directed*, `a_k = dir * (edge_k - firstEdge)` with
 *   `dir = sign(lastEdge - firstEdge)`, so they ascend from 0 to the extent for both ascending and
 *   descending input and every lookup is one code path.
 * - **Cell lookup**: axes whose cells all have the same width (see {@link isUniformEdges}) use
 *   `floor(a * n / extent)`; others binary-search the edge texture (at most
 *   {@link HEATMAP_MAX_SEARCH_STEPS} steps, i.e. up to 2^24 cells per axis).
 * - **Smoothing** (`HeatmapData.smoothing`): `false` = nearest cell; `'fast'` = bilinear in index
 *   space (like GPU linear filtering with clamp-to-edge); `'best'` = bilinear in data space between
 *   cell centers (correct for non-uniform edges). Values are interpolated, then colored. If the cell
 *   under the fragment is NaN the fragment is transparent; otherwise only the finite corners take
 *   part, with renormalized weights. Plotly differs slightly: its `'fast'` stretches an `nx × ny`
 *   image uniformly over the extent, its `'best'` on bin edges interpolates in index space, and it
 *   extrapolates missing neighbors instead of renormalizing.
 * - **Gaps** (`xgap` / `ygap`, smoothing off only): fragments within `gap / 2` CSS px of a cell's
 *   edges are discarded, where px = data distance × |transform scale| (2D world px).
 *
 * Zoom / pan only rewrite transform uniforms; style changes only uniforms; a colorscale change swaps
 * a shared LUT; only z / edge changes upload textures (reusing them when their size is unchanged).
 *
 * The shaders live in `heatmap.glsl.ts`; everything in this module except {@link HeatmapPrimitive}
 * is pure and mirrors the fragment shader step by step (`sampleHeatmap`), so it is unit-tested
 * without WebGL and reused for hover.
 */
import {
  ClampToEdgeWrapping,
  DataTexture,
  FloatType,
  Mesh,
  NearestFilter,
  NoColorSpace,
  RedFormat,
  RGFormat,
  Vector2,
  type BufferGeometry,
  type ShaderMaterial,
  type Texture,
} from 'three';
import {
  acquireColorscaleTexture,
  COLORSCALE_LUT_SIZE,
  sampleColorscale,
  type Colorscale,
  type ColorscaleTextureHandle,
} from '../colorscale/lut.ts';
import type { ColorscaleInterpolation } from '../colorscale/interpolate.ts';
import type { Vec3 } from '../precision.ts';
import type { DataTransform, Primitive, PrimitiveContext, RGBA, ViewportSize } from '../types.ts';
import { IDENTITY_TRANSFORM } from '../types.ts';
import {
  UNIT_QUAD_KEY,
  applyTransformUniforms,
  applyViewportUniforms,
  createPrimitiveMaterial,
  createTransformUniforms,
  createUnitQuadTemplate,
  createViewportUniforms,
  syncViewportUniforms,
  type TransformUniforms,
  type ViewportUniforms,
} from './common.ts';
import {
  HEATMAP_FRAGMENT_SHADER,
  HEATMAP_MAX_SEARCH_STEPS,
  HEATMAP_VERTEX_SHADER,
} from './heatmap.glsl.ts';

export { HEATMAP_MAX_SEARCH_STEPS } from './heatmap.glsl.ts';

/** Row width (texels) of the value and edge textures; rows wrap past it. */
export const HEATMAP_TEXTURE_WIDTH = 4096;

/** Plotly `zsmooth`: `false` = nearest cell, `'fast'` = index-space, `'best'` = data-space bilinear. */
export type HeatmapSmoothing = false | 'fast' | 'best';

/** Data for {@link HeatmapPrimitive}. */
export interface HeatmapData {
  /** Row-major values: `z[j * nx + i]` is column i (x) of row j (y). Non-finite = transparent. */
  z: ArrayLike<number>;
  nx: number;
  ny: number;
  /**
   * Cell edges in LINEAR data coordinates (caller already applied log10 / category index): `nx + 1`
   * values, strictly monotonic, ascending or descending. Anything else hides the heatmap.
   */
  xEdges: ArrayLike<number>;
  /** `ny + 1` edges, same rules. */
  yEdges: ArrayLike<number>;
  /** sRGB 0–1 stops (shared LUT texture). */
  colorscale: Colorscale;
  /** Space the LUT interpolates stops in. Default 'rgb'. */
  interpolation: ColorscaleInterpolation;
  /** Value at colorscale 0 (uniform). Default: min finite z (0 when none). */
  zmin: number;
  /** Value at colorscale 1 (uniform). Default: max finite z (1 when none). */
  zmax: number;
  /** Uniform. Default false. */
  reversescale: boolean;
  /** Uniform. Default false. */
  smoothing: HeatmapSmoothing;
  /** Gaps between cells in CSS px (Plotly xgap / ygap), only applied without smoothing. Default 0. */
  xgap: number;
  ygap: number;
  /** Multiplies alpha (uniform). Default 1. */
  opacity: number;
}

/** Required fields of {@link HeatmapData}; the rest have defaults. */
export type HeatmapInput = Partial<HeatmapData> &
  Pick<HeatmapData, 'z' | 'nx' | 'ny' | 'xEdges' | 'yEdges' | 'colorscale'>;

/** Fields {@link sampleHeatmap} reads. */
export type HeatmapSampleInput = Pick<HeatmapData, 'z' | 'nx' | 'ny' | 'xEdges' | 'yEdges'> &
  Partial<Pick<HeatmapData, 'smoothing' | 'xgap' | 'ygap'>>;

// ---------------------------------------------------------------------------------------------
// Axes and cell lookup (CPU mirror of hmEdge / hmCell / hmLerp)
// ---------------------------------------------------------------------------------------------

/**
 * One validated heatmap axis in directed space: `rel[k] = dir * (edges[k] - origin)` ascends from 0
 * to `extent`.
 */
export interface HeatmapAxis {
  /** Cell count. */
  readonly n: number;
  /** First edge (the axis' RTC origin). */
  readonly origin: number;
  /** +1 for ascending edges, −1 for descending. */
  readonly dir: 1 | -1;
  /** `|lastEdge - firstEdge|`. */
  readonly extent: number;
  /** Equal-width cells: the shader computes edges instead of searching the edge texture. */
  readonly uniform: boolean;
  /** Directed relative edges, `n + 1` values. */
  readonly rel: Float64Array;
}

/**
 * Whether the first `n + 1` edges have equal widths: within 1e-9 relative, plus a few float64 ulps
 * of the largest edge magnitude (so equal-width bins at large offsets, e.g. ms timestamps, qualify).
 */
export function isUniformEdges(edges: ArrayLike<number>, n = edges.length - 1): boolean {
  if (!(n >= 1) || edges.length < n + 1) return false;
  const w0 = edges[1]! - edges[0]!;
  if (!(w0 !== 0 && Number.isFinite(w0))) return false;
  let mag = 0;
  for (let k = 0; k <= n; k++) mag = Math.max(mag, Math.abs(edges[k]!));
  const tol = 1e-9 * Math.abs(w0) + 4 * Number.EPSILON * mag;
  for (let k = 0; k < n; k++) {
    if (!(Math.abs(edges[k + 1]! - edges[k]! - w0) <= tol)) return false;
  }
  return true;
}

/**
 * Validate the first `n + 1` edges and build a {@link HeatmapAxis}. Returns undefined for fewer
 * than one cell, missing / non-finite edges, or edges that are not strictly monotonic.
 */
export function createHeatmapAxis(
  edges: ArrayLike<number>,
  n = edges.length - 1,
): HeatmapAxis | undefined {
  if (!(n >= 1) || !Number.isInteger(n) || edges.length < n + 1) return undefined;
  const origin = edges[0]!;
  const last = edges[n]!;
  if (!Number.isFinite(origin) || !Number.isFinite(last) || origin === last) return undefined;
  const dir = last > origin ? 1 : -1;
  const rel = new Float64Array(n + 1);
  for (let k = 1; k <= n; k++) {
    const v = edges[k]!;
    const r = dir * (v - origin);
    if (!Number.isFinite(v) || !(r > rel[k - 1]!)) return undefined;
    rel[k] = r;
  }
  return { n, origin, dir, extent: rel[n]!, uniform: isUniformEdges(edges, n), rel };
}

/** Directed edge `k` of an axis (mirror of `hmEdge`). */
export function heatmapAxisEdge(axis: HeatmapAxis, k: number): number {
  return axis.uniform ? (axis.extent * k) / axis.n : axis.rel[k]!;
}

/**
 * Cell containing directed coordinate `a` ∈ [0, extent] (mirror of `hmCell`): half-open
 * `[a_i, a_{i+1})`, the last edge inclusive.
 */
export function heatmapAxisCell(axis: HeatmapAxis, a: number): number {
  const { n } = axis;
  if (axis.uniform) return Math.min(n - 1, Math.max(0, Math.floor((a * n) / axis.extent)));
  let lo = 0;
  let hi = n;
  for (let s = 0; s < HEATMAP_MAX_SEARCH_STEPS; s++) {
    if (hi - lo <= 1) break;
    const mid = (lo + hi) >> 1;
    if (heatmapAxisEdge(axis, mid) <= a) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Cell index of data value `v` for `edges` (both directions): −1 outside `[first, last]`, for NaN,
 * or for invalid edges. Cells are half-open in the edges' own direction, `[e_i, e_{i+1})`, and the
 * last edge belongs to the last cell.
 */
export function heatmapCellIndex(edges: ArrayLike<number>, v: number): number {
  const axis = createHeatmapAxis(edges);
  if (!axis) return -1;
  const a = axis.dir * (v - axis.origin);
  if (!(a >= 0 && a <= axis.extent)) return -1;
  return heatmapAxisCell(axis, a);
}

/** Interpolation neighbors along one axis: value = `z[i0] * (1 - f) + z[i1] * f`. */
export interface HeatmapLerp {
  i0: number;
  i1: number;
  f: number;
}

/** Interpolation neighbors for directed coordinate `a` in `cell` (mirror of `hmLerp`). */
export function heatmapAxisLerp(
  axis: HeatmapAxis,
  a: number,
  cell: number,
  smoothing: 'fast' | 'best',
  out: HeatmapLerp = { i0: 0, i1: 0, f: 0 },
): HeatmapLerp {
  const { n } = axis;
  const e0 = heatmapAxisEdge(axis, cell);
  const e1 = heatmapAxisEdge(axis, cell + 1);
  if (smoothing === 'fast') {
    const s = Math.min(n - 1, Math.max(0, cell + (a - e0) / (e1 - e0) - 0.5));
    out.i0 = Math.min(Math.floor(s), Math.max(n - 2, 0));
    out.i1 = Math.min(out.i0 + 1, n - 1);
    out.f = out.i1 === out.i0 ? 0 : s - out.i0;
    return out;
  }
  const c = 0.5 * (e0 + e1);
  if (a < c) {
    if (cell === 0) return set(out, 0, 0, 0);
    const cp = 0.5 * (heatmapAxisEdge(axis, cell - 1) + e0);
    return set(out, cell - 1, cell, (a - cp) / (c - cp));
  }
  if (cell === n - 1) return set(out, cell, cell, 0);
  const cn = 0.5 * (e1 + heatmapAxisEdge(axis, cell + 2));
  return set(out, cell, cell + 1, (a - c) / (cn - c));
}

function set(out: HeatmapLerp, i0: number, i1: number, f: number): HeatmapLerp {
  out.i0 = i0;
  out.i1 = i1;
  out.f = f;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Value lookup and color (CPU mirror of main())
// ---------------------------------------------------------------------------------------------

/**
 * Whether directed coordinate `a` in `cell` falls in the gap strip: within `gap / 2` px of either
 * cell edge, with px = data distance × `pxPerUnit` (|transform scale|). Always false for gap ≤ 0.
 */
export function inHeatmapGap(
  axis: HeatmapAxis,
  a: number,
  cell: number,
  gap: number,
  pxPerUnit: number,
): boolean {
  if (!(gap > 0)) return false;
  const px =
    Math.min(a - heatmapAxisEdge(axis, cell), heatmapAxisEdge(axis, cell + 1) - a) *
    Math.abs(pxPerUnit);
  return px < 0.5 * gap;
}

/**
 * The value the shader colors at data point `(x, y)` (linear data coordinates), or NaN where the
 * fragment is transparent: outside the edges, on a non-finite cell, in a gap, or for invalid data.
 * `transform` only matters for gaps (px per data unit); default identity.
 */
export function sampleHeatmap(
  data: HeatmapSampleInput,
  x: number,
  y: number,
  transform: DataTransform = IDENTITY_TRANSFORM,
): number {
  const xAxis = createHeatmapAxis(data.xEdges, data.nx);
  const yAxis = createHeatmapAxis(data.yEdges, data.ny);
  if (!xAxis || !yAxis) return NaN;
  return sampleHeatmapAxes(data, xAxis, yAxis, x, y, transform);
}

/** {@link sampleHeatmap} with prebuilt axes (for repeated lookups, e.g. hover). */
export function sampleHeatmapAxes(
  data: Pick<HeatmapData, 'z'> & Partial<Pick<HeatmapData, 'smoothing' | 'xgap' | 'ygap'>>,
  xAxis: HeatmapAxis,
  yAxis: HeatmapAxis,
  x: number,
  y: number,
  transform: DataTransform = IDENTITY_TRANSFORM,
): number {
  const { z } = data;
  const nx = xAxis.n;
  const zAt = (i: number, j: number): number => {
    const k = j * nx + i;
    const v = k < z.length ? z[k]! : NaN;
    return Number.isFinite(v) ? v : NaN;
  };
  const ax = xAxis.dir * (x - xAxis.origin);
  const ay = yAxis.dir * (y - yAxis.origin);
  if (!(ax >= 0 && ay >= 0 && ax <= xAxis.extent && ay <= yAxis.extent)) return NaN;
  const i = heatmapAxisCell(xAxis, ax);
  const j = heatmapAxisCell(yAxis, ay);
  const v = zAt(i, j);
  if (Number.isNaN(v)) return NaN;
  const smoothing = data.smoothing ?? false;
  if (smoothing === false) {
    if (inHeatmapGap(xAxis, ax, i, data.xgap ?? 0, transform.scaleX)) return NaN;
    if (inHeatmapGap(yAxis, ay, j, data.ygap ?? 0, transform.scaleY)) return NaN;
    return v;
  }
  const lx = heatmapAxisLerp(xAxis, ax, i, smoothing);
  const ly = heatmapAxisLerp(yAxis, ay, j, smoothing);
  let acc = 0;
  let ws = 0;
  const corner = (ci: number, cj: number, w: number): void => {
    const c = zAt(ci, cj);
    if (Number.isNaN(c) || w === 0) return;
    acc += w * c;
    ws += w;
  };
  corner(lx.i0, ly.i0, (1 - lx.f) * (1 - ly.f));
  corner(lx.i1, ly.i0, lx.f * (1 - ly.f));
  corner(lx.i0, ly.i1, (1 - lx.f) * ly.f);
  corner(lx.i1, ly.i1, lx.f * ly.f);
  return ws > 0 ? acc / ws : v;
}

/**
 * Colorscale position of `v` (mirror of the shader): `clamp((v - zmin) / (zmax - zmin), 0, 1)`,
 * 0.5 when `zmax == zmin`, flipped by `reverse`. NaN for non-finite `v`.
 */
export function heatmapColorT(v: number, zmin: number, zmax: number, reverse = false): number {
  if (!Number.isFinite(v)) return NaN;
  const span = zmax - zmin;
  const t = span === 0 ? 0.5 : Math.min(1, Math.max(0, (v - zmin) / span));
  return reverse ? 1 - t : t;
}

/**
 * Straight-alpha sRGB color at data point `(x, y)` (without the LUT's 8-bit quantization), or
 * undefined where transparent. Defaults as in {@link createHeatmapPrimitive}.
 */
export function heatmapColorAt(
  data: HeatmapInput,
  x: number,
  y: number,
  transform: DataTransform = IDENTITY_TRANSFORM,
): RGBA | undefined {
  const d = withDefaults(data);
  const v = sampleHeatmap(d, x, y, transform);
  if (Number.isNaN(v)) return undefined;
  const t = heatmapColorT(v, d.zmin, d.zmax, d.reversescale);
  const c = sampleColorscale(d.colorscale, t, undefined, d.interpolation);
  return [c[0], c[1], c[2], c[3] * d.opacity];
}

/** `[min, max]` of the finite values among the first `count` of `z`; `[0, 1]` when none. */
export function heatmapZRange(z: ArrayLike<number>, count = z.length): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  const n = Math.min(count, z.length);
  for (let k = 0; k < n; k++) {
    const v = z[k]!;
    if (v < min && v > -Infinity) min = v;
    if (v > max && v < Infinity) max = v;
  }
  return min <= max ? [min, max] : [0, 1];
}

// ---------------------------------------------------------------------------------------------
// Texture layout
// ---------------------------------------------------------------------------------------------

/** A packed float texture image: `channels` floats per texel, row-major, `width × height`. */
export interface HeatmapTextureImage {
  data: Float32Array;
  width: number;
  height: number;
}

/** Texture size for `count` texels packed linearly with rows of at most `maxWidth`. */
export function heatmapTextureSize(
  count: number,
  maxWidth = HEATMAP_TEXTURE_WIDTH,
): { width: number; height: number } {
  const width = Math.max(1, Math.min(count, maxWidth));
  return { width, height: Math.max(1, Math.ceil(count / width)) };
}

/**
 * Pack values into the RG32F layout: texel `k = j * nx + i` at `(k % width, floor(k / width))`
 * holds `(z[k] - zOrigin, 1)`, or `(0, 0)` for non-finite / missing values and padding texels.
 * `out` is reused when it has the right length.
 */
export function packHeatmapValues(
  z: ArrayLike<number>,
  nx: number,
  ny: number,
  maxWidth = HEATMAP_TEXTURE_WIDTH,
  zOrigin = 0,
  out?: Float32Array,
): HeatmapTextureImage {
  const count = Math.max(0, nx) * Math.max(0, ny);
  const { width, height } = heatmapTextureSize(count, maxWidth);
  const size = width * height * 2;
  const data = out?.length === size ? out : new Float32Array(size);
  const n = Math.min(count, z.length);
  for (let k = 0; k < n; k++) {
    const v = z[k]!;
    const ok = Number.isFinite(v);
    data[2 * k] = ok ? v - zOrigin : 0;
    data[2 * k + 1] = ok ? 1 : 0;
  }
  data.fill(0, 2 * n);
  return { data, width, height };
}

/**
 * Pack both axes' directed edges into the R32F layout: x edges at texels `[0, nx]`, y edges at
 * `[yBase, yBase + ny]` with `yBase = nx + 1`, wrapping rows past `maxWidth`.
 */
export function packHeatmapEdges(
  x: HeatmapAxis,
  y: HeatmapAxis,
  maxWidth = HEATMAP_TEXTURE_WIDTH,
  out?: Float32Array,
): HeatmapTextureImage & { yBase: number } {
  const yBase = x.n + 1;
  const count = yBase + y.n + 1;
  const { width, height } = heatmapTextureSize(count, maxWidth);
  const data = out?.length === width * height ? out : new Float32Array(width * height);
  data.set(x.rel, 0);
  data.set(y.rel, yBase);
  data.fill(0, count);
  return { data, width, height, yBase };
}

function createFloatTexture(image: HeatmapTextureImage, rg: boolean, name: string): DataTexture {
  const texture = new DataTexture(
    image.data,
    image.width,
    image.height,
    rg ? RGFormat : RedFormat,
    FloatType,
  );
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.colorSpace = NoColorSpace;
  texture.flipY = false;
  texture.unpackAlignment = 4;
  texture.name = name;
  texture.needsUpdate = true;
  return texture;
}

/** Write `image` into `texture` when it has the same size; otherwise create a new texture. */
function uploadInto(
  texture: DataTexture | undefined,
  image: HeatmapTextureImage,
  rg: boolean,
  name: string,
): DataTexture {
  if (texture && texture.image.width === image.width && texture.image.height === image.height) {
    if (texture.image.data !== image.data) (texture.image.data as Float32Array).set(image.data);
    texture.needsUpdate = true;
    return texture;
  }
  texture?.dispose();
  return createFloatTexture(image, rg, name);
}

// ---------------------------------------------------------------------------------------------
// Primitive
// ---------------------------------------------------------------------------------------------

/** Uniforms of the heatmap material (exposed for tests and debugging). */
export interface HeatmapUniforms extends TransformUniforms, ViewportUniforms {
  uExtent: { value: Vector2 };
  uCount: { value: Vector2 };
  uUniform: { value: Vector2 };
  uYBase: { value: number };
  uZ: { value: Texture | null };
  uEdges: { value: Texture | null };
  uLut: { value: Texture | null };
  uLutSize: { value: number };
  uSmoothing: { value: number };
  uGap: { value: Vector2 };
  uZRange: { value: Vector2 };
  uReverse: { value: number };
  uOpacity: { value: number };
}

const SMOOTHING_CODE = { fast: 1, best: 2 } as const;

/** One z grid, one draw call. See the module header for the texture layout and shading rules. */
export class HeatmapPrimitive implements Primitive<HeatmapData> {
  readonly object: Mesh<BufferGeometry, ShaderMaterial>;
  readonly uniforms: HeatmapUniforms;
  private readonly context: PrimitiveContext;
  private readonly material: ShaderMaterial;
  private data: HeatmapData;
  /** zmin / zmax follow the data until given explicitly. */
  private autoZ: { min: boolean; max: boolean };
  private zOrigin = 0;
  private origin: Vec3 = [0, 0, 0];
  private transform: DataTransform = { ...IDENTITY_TRANSFORM };
  private xAxis: HeatmapAxis | undefined;
  private yAxis: HeatmapAxis | undefined;
  private zTexture: DataTexture | undefined;
  private edgeTexture: DataTexture | undefined;
  private lut: ColorscaleTextureHandle | undefined;
  private disposed = false;

  constructor(context: PrimitiveContext, data: HeatmapInput) {
    this.context = context;
    this.autoZ = { min: data.zmin === undefined, max: data.zmax === undefined };
    this.data = withDefaults(data);
    this.uniforms = {
      ...createTransformUniforms(),
      ...createViewportUniforms(),
      uExtent: { value: new Vector2(1, 1) },
      uCount: { value: new Vector2(0, 0) },
      uUniform: { value: new Vector2(0, 0) },
      uYBase: { value: 0 },
      uZ: { value: null },
      uEdges: { value: null },
      uLut: { value: null },
      uLutSize: { value: COLORSCALE_LUT_SIZE },
      uSmoothing: { value: 0 },
      uGap: { value: new Vector2(0, 0) },
      uZRange: { value: new Vector2(0, 1) },
      uReverse: { value: 0 },
      uOpacity: { value: 1 },
    };
    this.material = createPrimitiveMaterial({
      vertexShader: HEATMAP_VERTEX_SHADER,
      fragmentShader: HEATMAP_FRAGMENT_SHADER,
      uniforms: this.uniforms,
    });
    // Shared static unit quad placed by uniforms (released, not disposed, on dispose).
    const quad = context.resources.acquire(UNIT_QUAD_KEY, createUnitQuadTemplate);
    this.object = new Mesh(quad, this.material);
    // The quad is placed in the shader, so three's bounds are meaningless.
    this.object.frustumCulled = false;
    // The fragment shader finds cells from the fragment's pixel position (see the shader).
    this.object.onBeforeRender = (renderer) => {
      syncViewportUniforms(this.uniforms, renderer);
    };
    this.writeEdges();
    this.writeValues();
    this.writeLut();
    this.writeStyle();
  }

  /** The current data (with defaults applied). */
  get current(): Readonly<HeatmapData> {
    return this.data;
  }

  update(patch: Partial<HeatmapData>): void {
    if (this.disposed) return;
    const prev = this.data;
    if (patch.zmin !== undefined) this.autoZ.min = false;
    if (patch.zmax !== undefined) this.autoZ.max = false;
    this.data = { ...prev, ...definedOnly(patch) };
    const shape = this.data.nx !== prev.nx || this.data.ny !== prev.ny;
    const valuesChanged = patch.z !== undefined || shape;
    if (patch.xEdges !== undefined || patch.yEdges !== undefined || shape) this.writeEdges();
    if (valuesChanged) this.writeValues();
    if (patch.colorscale !== undefined || patch.interpolation !== undefined) this.writeLut();
    this.writeStyle();
    this.context.invalidate();
  }

  /** Uniforms only: textures are never touched. */
  setTransform(transform: DataTransform): void {
    this.transform = { ...transform };
    applyTransformUniforms(this.uniforms, this.transform, this.origin);
    this.context.invalidate();
  }

  /** The viewport size (render targets; the canvas is synced before each draw). */
  setViewport(size: ViewportSize): void {
    applyViewportUniforms(this.uniforms, size);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.object.removeFromParent();
    this.zTexture?.dispose();
    this.edgeTexture?.dispose();
    this.zTexture = undefined;
    this.edgeTexture = undefined;
    this.uniforms.uZ.value = null;
    this.uniforms.uEdges.value = null;
    this.uniforms.uLut.value = null;
    this.lut?.release();
    this.lut = undefined;
    this.material.dispose();
    this.context.resources.release(UNIT_QUAD_KEY);
  }

  /** Axes, origin, extent and the edge texture. */
  private writeEdges(): void {
    const { nx, ny, xEdges, yEdges } = this.data;
    this.xAxis = createHeatmapAxis(xEdges, nx);
    this.yAxis = createHeatmapAxis(yEdges, ny);
    const u = this.uniforms;
    if (this.xAxis && this.yAxis) {
      const { xAxis: x, yAxis: y } = this;
      const image = packHeatmapEdges(
        x,
        y,
        HEATMAP_TEXTURE_WIDTH,
        this.edgeTexture?.image.data as Float32Array | undefined,
      );
      this.edgeTexture = uploadInto(this.edgeTexture, image, false, 'holochart:heatmap-edges');
      u.uEdges.value = this.edgeTexture;
      u.uYBase.value = image.yBase;
      u.uExtent.value.set(x.dir * x.extent, y.dir * y.extent);
      u.uUniform.value.set(x.uniform ? 1 : 0, y.uniform ? 1 : 0);
      this.origin = [x.origin, y.origin, 0];
    }
    u.uCount.value.set(Math.max(0, nx | 0), Math.max(0, ny | 0));
    applyTransformUniforms(u, this.transform, this.origin);
  }

  /** The value texture, zOrigin and automatic zmin / zmax. */
  private writeValues(): void {
    const { z, nx, ny } = this.data;
    const count = Math.max(0, nx) * Math.max(0, ny);
    const [lo, hi] = heatmapZRange(z, count);
    if (this.autoZ.min) this.data.zmin = lo;
    if (this.autoZ.max) this.data.zmax = hi;
    if (count === 0) return;
    // Center of the finite range: small float32 deltas for values with a large common offset.
    this.zOrigin = (lo + hi) / 2;
    const image = packHeatmapValues(
      z,
      nx,
      ny,
      HEATMAP_TEXTURE_WIDTH,
      this.zOrigin,
      this.zTexture?.image.data as Float32Array | undefined,
    );
    this.zTexture = uploadInto(this.zTexture, image, true, 'holochart:heatmap-values');
    this.uniforms.uZ.value = this.zTexture;
  }

  /** Shared LUT (the new one is acquired before the old one is released). */
  private writeLut(): void {
    const { colorscale, interpolation } = this.data;
    const next =
      colorscale.length > 0
        ? acquireColorscaleTexture(this.context.resources, colorscale, interpolation)
        : undefined;
    this.lut?.release();
    this.lut = next;
    this.uniforms.uLut.value = next?.texture ?? null;
  }

  /** Style uniforms and visibility. */
  private writeStyle(): void {
    const d = this.data;
    const u = this.uniforms;
    u.uZRange.value.set(d.zmin - this.zOrigin, d.zmax - this.zOrigin);
    u.uReverse.value = d.reversescale ? 1 : 0;
    u.uSmoothing.value = d.smoothing ? SMOOTHING_CODE[d.smoothing] : 0;
    u.uGap.value.set(Math.max(0, d.xgap || 0), Math.max(0, d.ygap || 0));
    u.uOpacity.value = d.opacity;
    this.object.visible =
      this.xAxis !== undefined &&
      this.yAxis !== undefined &&
      this.zTexture !== undefined &&
      this.lut !== undefined &&
      Number.isFinite(d.zmin) &&
      Number.isFinite(d.zmax);
  }
}

function definedOnly(patch: Partial<HeatmapData>): Partial<HeatmapData> {
  const out: Partial<HeatmapData> = {};
  for (const key of Object.keys(patch) as (keyof HeatmapData)[]) {
    if (patch[key] !== undefined) (out as Record<string, unknown>)[key] = patch[key];
  }
  return out;
}

function withDefaults(d: HeatmapInput): HeatmapData {
  const needRange = d.zmin === undefined || d.zmax === undefined;
  const [lo, hi] = needRange ? heatmapZRange(d.z, Math.max(0, d.nx) * Math.max(0, d.ny)) : [0, 1];
  return {
    ...d,
    interpolation: d.interpolation ?? 'rgb',
    zmin: d.zmin ?? lo,
    zmax: d.zmax ?? hi,
    reversescale: d.reversescale ?? false,
    smoothing: d.smoothing ?? false,
    xgap: d.xgap ?? 0,
    ygap: d.ygap ?? 0,
    opacity: d.opacity ?? 1,
  };
}

/** Create a {@link HeatmapPrimitive}. */
export function createHeatmapPrimitive(
  ctx: PrimitiveContext,
  data: HeatmapInput,
): HeatmapPrimitive {
  return new HeatmapPrimitive(ctx, data);
}
