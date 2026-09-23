/**
 * Instanced rectangle primitive (plan E2.7): bars, heatmap cells, candlestick bodies, treemap
 * tiles. One draw call for any number of rects.
 *
 * ## Geometry
 * Each rect is given in **data space** as `(x0, y0) – (x1, y1)` (Float64, RTC-encoded, ADR-008), so
 * bars follow pan/zoom through {@link RectPrimitive.setTransform} with no buffer upload. Inverted
 * rects (`x1 < x0` or `y1 < y0`) are fine: the shader works in the rect's own (u, v) frame and the
 * material is double-sided. Rects with a non-finite coordinate, or that project to less than
 * 1e-4 px on an axis, are not drawn.
 *
 * ## Styling (all sizes in CSS px)
 * Fill, border color and border width, and a corner radius (SDF rounded rect, clamped to half the
 * smaller side). The border is drawn inside the rect (`borderAlign: 'inside'`, the default, so
 * adjacent cells never overlap) or centered on its edge (`'center'`, SVG/Plotly `marker.line`
 * semantics). With `'center'` the corner radius is that of the edge path: the outer border corner
 * gets `r + bw/2`, the inner one `max(r - bw/2, 0)`.
 *
 * ## Pixel snapping (`snap: true`)
 * The rect's projected edges are snapped to the device-pixel grid in the vertex shader, and the
 * border width is rounded to whole device pixels (at least one). With `'inside'` borders the edges
 * land on pixel boundaries; with `'center'` borders the edges are offset by half the border so the
 * *outer* border edge lands on a boundary. Because the fragment AA ramp is exactly one device pixel
 * centred on the edge, a snapped edge gives every pixel a coverage of exactly 0 or 1 — a 1 px
 * border covers exactly one device-pixel column at DPR 1 (two at DPR 2). A span that would snap to
 * zero width keeps one device pixel. Snapping assumes an axis-aligned (2D) projection.
 *
 * ## 3D
 * The four corners are projected individually in the plane `z` (default 0), so rects are correct
 * under any camera. Border width and radius are evaluated in screen px with a per-vertex metric:
 * exact for orthographic views, an interpolated approximation under perspective.
 *
 * `depth` is reserved for extruded boxes (plan E8.9) and is currently ignored.
 */
import {
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  Mesh,
  type InstancedBufferGeometry,
  type ShaderMaterial,
} from 'three';
import {
  IDENTITY_TRANSFORM,
  type ColorInput,
  type DataTransform,
  type Primitive,
  type PrimitiveContext,
  type ScalarInput,
  type ViewportSize,
} from '../types.ts';
import {
  UNIT_QUAD_KEY,
  acquireInstancedGeometry,
  applyTransformUniforms,
  applyViewportUniforms,
  computeOrigin,
  createPrimitiveMaterial,
  syncViewportUniforms,
  createTransformUniforms,
  createUnitQuadTemplate,
  createViewportUniforms,
  expandColor,
  expandScalar,
  snapToDevicePixel,
  type NumericArray,
  type Vec3,
} from './common.ts';
import { RECT_FRAGMENT_SHADER, RECT_VERTEX_SHADER } from './rect.glsl.ts';

/** Where a rect's border sits relative to its geometric edge. */
export type RectBorderAlign = 'inside' | 'center';

/** Data accepted by {@link RectPrimitive}. Coordinates are in data space; sizes in CSS px. */
export interface RectData {
  /** Corner coordinates (data space). `Float64Array` preferred. The count is the shortest array. */
  x0: NumericArray;
  y0: NumericArray;
  x1: NumericArray;
  y1: NumericArray;
  /** Plane z per rect, for 3D scenes (data space). Default 0. */
  z?: NumericArray;
  /** sRGB RGBA fill. Default opaque mid-grey. */
  fill: ColorInput;
  /** sRGB RGBA border color. Default transparent. */
  borderColor: ColorInput;
  /** Border width in CSS px. Default 0. */
  borderWidth: ScalarInput;
  /** Corner radius in CSS px, clamped to half the smaller side. Default 0. */
  cornerRadius: ScalarInput;
  /** Reserved for extrusion (plan E8.9); currently ignored. */
  depth: ScalarInput;
  /** Snap edges to device pixels for crisp 1 px borders (2D). Default false. */
  snap: boolean;
  /** Default `'inside'`. */
  borderAlign: RectBorderAlign;
  /** Multiplies every color's alpha. Default 1. */
  opacity: number;
}

const DEFAULTS: Omit<RectData, 'x0' | 'y0' | 'x1' | 'y1'> = {
  fill: [0.5, 0.5, 0.5, 1],
  borderColor: [0, 0, 0, 0],
  borderWidth: 0,
  cornerRadius: 0,
  depth: 0,
  snap: false,
  borderAlign: 'inside',
  opacity: 1,
};

const GEOMETRY_KEYS = ['x0', 'y0', 'x1', 'y1', 'z'] as const;

/** Number of rects described by the coordinate arrays (the shortest one). */
export function rectCount(data: Pick<RectData, 'x0' | 'y0' | 'x1' | 'y1'>): number {
  return Math.min(data.x0.length, data.y0.length, data.x1.length, data.y1.length);
}

/** RTC-encoded rect geometry, as uploaded to the `iRect` / `iZ` instance attributes. */
export interface PackedRects {
  /** Float64 origin subtracted from every coordinate. */
  origin: Vec3;
  /** `x0, y0, x1, y1` minus origin, 4 per rect. Non-finite rects are all zeros (not drawn). */
  rect: Float32Array;
  /** `z` minus origin, 1 per rect. */
  z: Float32Array;
}

/**
 * Pack rect corners relative to a float64 origin (the center of the finite bounding box of both
 * corners), so float32 deltas stay precise for large coordinates such as ms timestamps.
 */
export function packRects(
  data: Pick<RectData, 'x0' | 'y0' | 'x1' | 'y1' | 'z'>,
  count: number = rectCount(data),
  out?: { rect: Float32Array; z: Float32Array },
): PackedRects {
  const { x0, y0, x1, y1 } = data;
  const zs = data.z && data.z.length > 0 ? data.z : undefined;
  const origin: Vec3 = [spanCenter(x0, x1), spanCenter(y0, y1), computeOrigin(zs, undefined)[0]];
  const rect = out?.rect ?? new Float32Array(count * 4);
  const z = out?.z ?? new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const ax = x0[i]!;
    const ay = y0[i]!;
    const bx = x1[i]!;
    const by = y1[i]!;
    const zi = zs ? zs[Math.min(i, zs.length - 1)]! : 0;
    const o = i * 4;
    if (
      Number.isFinite(ax) &&
      Number.isFinite(ay) &&
      Number.isFinite(bx) &&
      Number.isFinite(by) &&
      Number.isFinite(zi)
    ) {
      rect[o] = ax - origin[0];
      rect[o + 1] = ay - origin[1];
      rect[o + 2] = bx - origin[0];
      rect[o + 3] = by - origin[1];
      z[i] = zi - origin[2];
    } else {
      // A zero-size rect is culled by the vertex shader (gaps stay invisible).
      rect[o] = rect[o + 1] = rect[o + 2] = rect[o + 3] = 0;
      z[i] = 0;
    }
  }
  return { origin, rect, z };
}

/** Center of the finite bounding range of two coordinate arrays (0 when there is none). */
function spanCenter(a: NumericArray, b: NumericArray): number {
  let min = Infinity;
  let max = -Infinity;
  for (const values of [a, b]) {
    for (let i = 0; i < values.length; i++) {
      const v = values[i]!;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return Number.isFinite(min) && Number.isFinite(max) ? (min + max) / 2 : 0;
}

/**
 * Exact signed distance from `(px, py)` to a rounded rect centred at the origin with half extents
 * `(hx, hy)` and corner radius `r` (≤ min(hx, hy)); negative inside. Mirror of the GLSL version.
 */
export function roundedRectSDF(px: number, py: number, hx: number, hy: number, r: number): number {
  const qx = Math.abs(px) - hx + r;
  const qy = Math.abs(py) - hy + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

/**
 * Snap a screen-space span `[a, b]` (either order) to the device-pixel grid. A non-empty span never
 * collapses: it keeps at least one device pixel. Mirror of `snapSpan` in the vertex shader.
 */
export function snapRectSpan(
  a: number,
  b: number,
  pixelRatio: number,
  phase = 0,
): [number, number] {
  const sa = snapToDevicePixel(a, pixelRatio, phase);
  let sb = snapToDevicePixel(b, pixelRatio, phase);
  if (sa === sb && a !== b) sb = sa + Math.sign(b - a) / pixelRatio;
  return [sa, sb];
}

/** Screen-space (CSS px, y-up) placement of one 2D rect after snapping — see {@link rectScreenGeometry}. */
export interface RectScreenGeometry {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Effective border width (rounded to device pixels when snapping). */
  borderWidth: number;
  /** How far the border extends outside the geometric edge. */
  outset: number;
}

/**
 * CPU mirror of the vertex shader for an axis-aligned (2D) projection: given the projected corners
 * `(sx0, sy0)` and `(sx1, sy1)` in CSS px, apply border rounding and pixel snapping.
 */
export function rectScreenGeometry(
  sx0: number,
  sy0: number,
  sx1: number,
  sy1: number,
  style: { borderWidth: number; snap: boolean; borderAlign: RectBorderAlign; pixelRatio: number },
): RectScreenGeometry {
  const dpr = style.pixelRatio > 0 ? style.pixelRatio : 1;
  let bw = Math.max(style.borderWidth, 0);
  if (style.snap && bw > 0) bw = Math.max(1, Math.round(bw * dpr)) / dpr;
  const outset = bw * (style.borderAlign === 'center' ? 0.5 : 0);
  if (!style.snap) return { x0: sx0, y0: sy0, x1: sx1, y1: sy1, borderWidth: bw, outset };
  const phase = fract(outset * dpr);
  const [x0, x1] = snapRectSpan(sx0, sx1, dpr, phase);
  const [y0, y1] = snapRectSpan(sy0, sy1, dpr, phase);
  return { x0, y0, x1, y1, borderWidth: bw, outset };
}

function fract(v: number): number {
  return v - Math.floor(v);
}

/** Fill / border coverage of a screen point — see {@link rectCoverage}. */
export interface RectCoverage {
  /** Coverage of the whole shape (border + fill), 0–1. */
  outer: number;
  /** Coverage of the fill region inside the border, 0–1 (1 when there is no border). */
  inner: number;
}

/**
 * CPU mirror of the fragment shader: anti-aliased coverage at screen point `(px, py)` (CSS px) for
 * a rect placed by {@link rectScreenGeometry}. The AA ramp is one device pixel centred on the edge.
 */
export function rectCoverage(
  px: number,
  py: number,
  g: RectScreenGeometry,
  cornerRadius: number,
  pixelRatio: number,
): RectCoverage {
  const hx = Math.abs(g.x1 - g.x0) / 2;
  const hy = Math.abs(g.y1 - g.y0) / 2;
  const cx = (g.x0 + g.x1) / 2;
  const cy = (g.y0 + g.y1) / 2;
  const r = Math.min(Math.max(cornerRadius, 0), hx, hy);
  const o = g.outset;
  const d = roundedRectSDF(px - cx, py - cy, hx + o, hy + o, r > 0 ? r + o : 0);
  const aa = 1 / (pixelRatio > 0 ? pixelRatio : 1);
  const outer = clamp01(0.5 - d / aa);
  const inner = g.borderWidth > 0 ? clamp01(0.5 - (d + g.borderWidth) / aa) : 1;
  return { outer, inner };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

interface RectBuffers {
  capacity: number;
  geometry: InstancedBufferGeometry;
  release(): void;
  rect: InstancedBufferAttribute;
  z: InstancedBufferAttribute;
  fill: InstancedBufferAttribute;
  borderColor: InstancedBufferAttribute;
  style: InstancedBufferAttribute;
}

/**
 * Instanced, anti-aliased rectangles with borders and rounded corners in a single draw call.
 * Style-only updates (`fill`, `borderColor`, `borderWidth`/`cornerRadius`) re-upload only the
 * affected instance attribute; coordinate updates re-upload the positions.
 */
export class RectPrimitive implements Primitive<RectData> {
  /** The mesh to add to a scene. */
  readonly object: Mesh;
  private readonly ctx: PrimitiveContext;
  private readonly material: ShaderMaterial;
  private readonly transformUniforms = createTransformUniforms();
  private readonly viewportUniforms = createViewportUniforms();
  private readonly data: RectData;
  private buffers: RectBuffers | undefined;
  private count = 0;
  private origin: Vec3 = [0, 0, 0];
  private transform: DataTransform = IDENTITY_TRANSFORM;
  private disposed = false;

  constructor(ctx: PrimitiveContext, data: Partial<RectData> = {}) {
    this.ctx = ctx;
    const empty = new Float64Array(0);
    this.data = { x0: empty, y0: empty, x1: empty, y1: empty, ...DEFAULTS };
    this.material = createPrimitiveMaterial({
      vertexShader: RECT_VERTEX_SHADER,
      fragmentShader: RECT_FRAGMENT_SHADER,
      uniforms: {
        ...this.transformUniforms,
        ...this.viewportUniforms,
        uSnap: { value: 0 },
        uBorderAlign: { value: 0 },
        uOpacity: { value: 1 },
      },
    });
    // Inverted rects and flipped axes reverse the winding.
    this.material.side = DoubleSide;
    this.buffers = this.allocate(16);
    this.object = new Mesh(this.buffers.geometry, this.material);
    // Keep screen-space sizing right even if setViewport is never called (see syncViewportUniforms).
    this.object.onBeforeRender = (renderer) => {
      syncViewportUniforms(this.viewportUniforms, renderer);
    };
    // Positions are RTC-encoded and expanded in the shader: three's bounds would be wrong.
    this.object.frustumCulled = false;
    this.update(data);
  }

  /** Number of rect instances currently drawn. */
  get instanceCount(): number {
    return this.count;
  }

  update(patch: Partial<RectData>): void {
    if (this.disposed) return;
    const data = this.data as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) data[key] = value;
    }
    const count = rectCount(this.data);
    const resized = count !== this.count;
    let b = this.buffers!;
    if (count > b.capacity) b = this.reallocate(count);
    this.count = count;
    b.geometry.instanceCount = count;
    const all = resized || b !== this.buffers;
    this.buffers = b;

    if (all || GEOMETRY_KEYS.some((k) => patch[k] !== undefined)) {
      const packed = packRects(this.data, count, {
        rect: b.rect.array as Float32Array,
        z: b.z.array as Float32Array,
      });
      this.origin = packed.origin;
      markRange(b.rect, count);
      markRange(b.z, count);
      applyTransformUniforms(this.transformUniforms, this.transform, this.origin);
    }
    if (all || patch.fill !== undefined) {
      expandColor(this.data.fill, count, b.fill.array as Float32Array);
      markRange(b.fill, count);
    }
    if (all || patch.borderColor !== undefined) {
      expandColor(this.data.borderColor, count, b.borderColor.array as Float32Array);
      markRange(b.borderColor, count);
    }
    if (all || patch.borderWidth !== undefined || patch.cornerRadius !== undefined) {
      packStyle(
        this.data.borderWidth,
        this.data.cornerRadius,
        count,
        b.style.array as Float32Array,
      );
      markRange(b.style, count);
    }

    const u = this.material.uniforms;
    u.uSnap!.value = this.data.snap ? 1 : 0;
    u.uBorderAlign!.value = this.data.borderAlign === 'center' ? 0.5 : 0;
    u.uOpacity!.value = this.data.opacity;
    this.ctx.invalidate();
  }

  setTransform(transform: DataTransform): void {
    this.transform = transform;
    applyTransformUniforms(this.transformUniforms, transform, this.origin);
    this.ctx.invalidate();
  }

  setViewport(size: ViewportSize): void {
    applyViewportUniforms(this.viewportUniforms, size);
    this.ctx.invalidate();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.object.removeFromParent();
    this.buffers?.release();
    this.buffers = undefined;
    this.material.dispose();
  }

  private reallocate(count: number): RectBuffers {
    const old = this.buffers!;
    // Acquire before releasing so the shared unit quad is never disposed in between.
    const next = this.allocate(Math.max(count, old.capacity * 2));
    this.object.geometry = next.geometry;
    old.release();
    return next;
  }

  private allocate(capacity: number): RectBuffers {
    const handle = acquireInstancedGeometry(
      this.ctx.resources,
      UNIT_QUAD_KEY,
      createUnitQuadTemplate,
    );
    const geometry = handle.geometry;
    const attr = (name: string, size: number): InstancedBufferAttribute => {
      const a = new InstancedBufferAttribute(new Float32Array(capacity * size), size);
      a.setUsage(DynamicDrawUsage);
      geometry.setAttribute(name, a);
      return a;
    };
    return {
      capacity,
      geometry,
      release: handle.release,
      rect: attr('iRect', 4),
      z: attr('iZ', 1),
      fill: attr('iFill', 4),
      borderColor: attr('iBorderColor', 4),
      style: attr('iStyle', 2),
    };
  }
}

/** Interleave border width and corner radius (px) into the `iStyle` attribute layout. */
function packStyle(
  borderWidth: ScalarInput,
  cornerRadius: ScalarInput,
  count: number,
  out: Float32Array,
): void {
  const bw = expandScalar(borderWidth, count, 0);
  const cr = expandScalar(cornerRadius, count, 0);
  for (let i = 0; i < count; i++) {
    out[i * 2] = bw[i]!;
    out[i * 2 + 1] = cr[i]!;
  }
}

/** Upload only the used prefix of an instance attribute. */
function markRange(attribute: InstancedBufferAttribute, count: number): void {
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, Math.min(attribute.array.length, count * attribute.itemSize));
  attribute.needsUpdate = true;
}

/** Create a {@link RectPrimitive}. */
export function createRectPrimitive(
  ctx: PrimitiveContext,
  data: Partial<RectData> = {},
): RectPrimitive {
  return new RectPrimitive(ctx, data);
}
