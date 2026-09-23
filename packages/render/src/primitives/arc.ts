/**
 * Instanced arc / annular-sector primitive (plan E2.8): pie, donut, sunburst, gauges, barpolar.
 * One draw call for any number of wedges; each wedge is an SDF evaluated on a tight bounding quad.
 *
 * ## Conventions
 * - **Center** in data space (Float64, RTC-encoded, ADR-008) — follows pan/zoom via
 *   {@link ArcPrimitive.setTransform}. **Radii, corner radius, pad and border are CSS px**: the wedge
 *   is drawn screen-aligned around its projected center (a billboard in 3D).
 * - **Angles** in radians, 0 = +x, counter-clockwise positive in the y-up world (the usual math
 *   convention; d3 uses 0 = 12 o'clock, clockwise, y-down: `ours = π/2 - d3`). The wedge covers
 *   `[min(a0, a1), max(a0, a1)]`; a span ≥ 2π draws the full ring (pad and corners ignored, as d3).
 *   Plotly pie mapping: slices start at `θ0 = π/2 - rotation·π/180`; with
 *   `direction: 'counterclockwise'` slice k spans `[θk, θk + 2π·fk]`, with `'clockwise'` it spans
 *   `[θk - 2π·fk, θk]`, accumulating θ as you go.
 * - **innerRadius = 0** draws a pie slice.
 *
 * ## d3-shape semantics
 * - `padAngle` / `padRadius` (d3.arc): each side is moved inwards, parallel to its radial edge, by
 *   `h = padRadius · sin(padAngle / 2)`, so neighbouring wedges are separated by a gap of constant
 *   width `2h ≈ padAngle · padRadius` px. `padRadius ≤ 0` / NaN means auto, `√(r0² + r1²)`, as d3.
 *   The corner positions match d3 exactly whenever the inner edge survives the padding. When it does
 *   not (pies, or very thin donut slices, d3's "collapsed" branch) d3 joins the outer corners to a
 *   single point on the inner circle, which tapers the gap; here the gap stays constant-width down
 *   to the apex instead (the apex sits `h / sin(θ/2)` from the center).
 * - `cornerRadius` (d3.arc): corners are rounded by circles tangent to the side and the arc, with
 *   the radius clamped to `|r1 - r0| / 2` and, for wedges narrower than π, so that the two outer (or
 *   inner) corner circles do not overlap (d3's `rc0` / `rc1` limits). Collapsed inner corners (and
 *   the pie apex) stay sharp, as in d3.
 * - The border is drawn inside the wedge. For a Plotly-style centered stroke, grow the outer radius
 *   and shrink the inner one by `bw / 2`; for slice separators prefer `padAngle`.
 */
import {
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
  createTransformUniforms,
  createUnitQuadTemplate,
  createViewportUniforms,
  expandColor,
  expandScalar,
  scalarAt,
  type NumericArray,
  type Vec3,
} from './common.ts';
import { ARC_FRAGMENT_SHADER, ARC_VERTEX_SHADER } from './arc.glsl.ts';

const TAU = Math.PI * 2;
const EPSILON = 1e-12;

/** Data accepted by {@link ArcPrimitive}. Centers in data space; sizes in CSS px; angles in radians. */
export interface ArcData {
  /** Wedge centers (data space). `Float64Array` preferred. The count is the shorter of x / y. */
  x: NumericArray;
  y: NumericArray;
  /** Center z per wedge, for 3D scenes. Default 0. */
  z?: NumericArray;
  /** Inner radius in px. Default 0 (pie slice). */
  innerRadius: ScalarInput;
  /** Outer radius in px. Default 50. */
  outerRadius: ScalarInput;
  /** Start angle, radians (0 = +x, counter-clockwise). Default 0. */
  startAngle: ScalarInput;
  /** End angle, radians. Default 2π. */
  endAngle: ScalarInput;
  /** Corner radius in px (d3.arc `cornerRadius`). Default 0. */
  cornerRadius: ScalarInput;
  /** Pad angle in radians (d3.arc `padAngle`). Default 0. */
  padAngle: ScalarInput;
  /** Pad radius in px (d3.arc `padRadius`); ≤ 0 or NaN = auto `√(r0² + r1²)`. Default auto. */
  padRadius: ScalarInput;
  /** sRGB RGBA fill. Default opaque mid-grey. */
  fill: ColorInput;
  /** sRGB RGBA border color. Default transparent. */
  borderColor: ColorInput;
  /** Border width in px, drawn inside the wedge. Default 0. */
  borderWidth: ScalarInput;
  /** Multiplies every color's alpha. Default 1. */
  opacity: number;
}

const DEFAULTS: Omit<ArcData, 'x' | 'y'> = {
  innerRadius: 0,
  outerRadius: 50,
  startAngle: 0,
  endAngle: TAU,
  cornerRadius: 0,
  padAngle: 0,
  padRadius: 0,
  fill: [0.5, 0.5, 0.5, 1],
  borderColor: [0, 0, 0, 0],
  borderWidth: 0,
  opacity: 1,
};

const CENTER_KEYS = ['x', 'y', 'z'] as const;
const SHAPE_KEYS = [
  'innerRadius',
  'outerRadius',
  'startAngle',
  'endAngle',
  'cornerRadius',
  'padAngle',
  'padRadius',
] as const;

/** Resolved per-wedge SDF parameters (see {@link computeArcShape}). */
export interface ArcShape {
  /** Inner / outer radius, px (`r0 ≤ r1`). */
  r0: number;
  r1: number;
  /** Bisector angle and half the angular span, radians (`half = π` for a full ring). */
  mid: number;
  half: number;
  /** Side offset from the radial edges, px (the pad gap is `2h`); `-1` for a full ring. */
  h: number;
  /** Outer / inner corner radius after d3's clamping, px (0 = sharp / no inner corner). */
  cornerOuter: number;
  cornerInner: number;
}

/** Inputs of {@link computeArcShape} (one wedge). */
export interface ArcShapeInput {
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
  cornerRadius?: number;
  padAngle?: number;
  padRadius?: number;
}

/**
 * Resolve one wedge's d3.arc parameters into SDF parameters: swap radii if needed, apply the pad
 * offset `h = padRadius · sin(padAngle / 2)` and clamp the corner radii (d3 `rc`, `rc0`, `rc1`).
 * Returns `null` for wedges that draw nothing (non-finite input, zero span or radius, or padding
 * that consumes the whole wedge).
 */
export function computeArcShape(input: ArcShapeInput): ArcShape | null {
  let r0 = Math.max(0, input.innerRadius);
  let r1 = Math.max(0, input.outerRadius);
  if (r1 < r0) [r0, r1] = [r1, r0];
  const a0 = input.startAngle;
  const a1 = input.endAngle;
  if (!Number.isFinite(r0) || !Number.isFinite(r1) || !Number.isFinite(a0) || !Number.isFinite(a1))
    return null;
  const da = Math.abs(a1 - a0);
  if (!(r1 > EPSILON) || !(da > EPSILON)) return null;
  const mid = (a0 + a1) / 2;
  // Tolerant enough for angles passed as float32 (ScalarInput), whose 2π spans are off by ~1e-6.
  if (da >= TAU - 1e-5) {
    return { r0, r1, mid: 0, half: Math.PI, h: -1, cornerOuter: 0, cornerInner: 0 };
  }
  const half = da / 2;
  const ap = finiteOr(input.padAngle, 0) / 2;
  let h = 0;
  if (ap > EPSILON) {
    const padRadius = finiteOr(input.padRadius, 0);
    const rp = padRadius > 0 ? padRadius : Math.sqrt(r0 * r0 + r1 * r1);
    h = rp * Math.sin(Math.min(ap, Math.PI / 2));
  }
  const sinHalf = Math.sin(half);
  // Padding wider than the wedge at the outer radius leaves nothing (d3: da1 ≤ ε).
  if (h >= r1 || (half < Math.PI / 2 && h >= r1 * sinHalf)) return null;

  const rc = Math.min(Math.abs(r1 - r0) / 2, Math.max(0, finiteOr(input.cornerRadius, 0)));
  let cornerOuter = 0;
  let cornerInner = 0;
  if (rc > EPSILON) {
    cornerOuter = Math.min(rc, (r1 - h) / 2);
    if (half < Math.PI / 2) cornerOuter = Math.min(cornerOuter, (r1 * sinHalf - h) / (1 + sinHalf));
    // The inner edge survives the padding (d3: da0 > ε) — otherwise its corners stay sharp.
    const innerSurvives = r0 > EPSILON && h < r0 && (half >= Math.PI / 2 || h < r0 * sinHalf);
    if (innerSurvives) {
      cornerInner = rc;
      if (half < Math.PI / 2 && sinHalf < 1) {
        cornerInner = Math.min(cornerInner, (r0 * sinHalf - h) / (1 - sinHalf));
      }
    }
    cornerOuter = Math.max(0, cornerOuter);
    cornerInner = Math.max(0, cornerInner);
  }
  return { r0, r1, mid, half, h, cornerOuter, cornerInner };
}

function finiteOr(v: number | undefined, fallback: number): number {
  return v !== undefined && Number.isFinite(v) ? v : fallback;
}

/**
 * Signed distance (px, negative inside) from a point at `(px, py)` px relative to the wedge
 * center (y-up) to the wedge. CPU mirror of `arcSDF` in the fragment shader.
 *
 * The point is rotated so the bisector lies on +x and folded onto y ≥ 0; by symmetry only the end
 * side matters. The side is the boundary of the gap wedge dilated by `h` (so the pad gap has
 * constant width), and each corner is replaced by its tangent circle inside the region where that
 * circle is the nearest boundary.
 */
export function arcSDF(px: number, py: number, s: ArcShape): number {
  const cm = Math.cos(s.mid);
  const sm = Math.sin(s.mid);
  const x = cm * px + sm * py;
  const y = Math.abs(-sm * px + cm * py);
  const len = Math.hypot(x, y);
  // A zero inner radius is no boundary at all (else the pie center would be an AA seam).
  let d = s.r0 > 0 ? Math.max(len - s.r1, s.r0 - len) : len - s.r1;
  if (s.h < 0) return d;

  const dx = Math.cos(s.half);
  const dy = Math.sin(s.half);
  // Normal of the end ray pointing into the wedge.
  const nx = dy;
  const ny = -dx;
  const t = x * dx + y * dy;
  const q = x * nx + y * ny;
  const phi = len > 0 ? Math.atan2(y, x) : 0;
  const distRay = t > 0 ? Math.abs(q) : len;
  d = Math.max(d, s.h - (phi <= s.half ? distRay : -distRay));

  if (s.cornerOuter > 0) {
    const rc = s.cornerOuter;
    const qk = s.h + rc;
    const tk = Math.sqrt(Math.max((s.r1 - rc) ** 2 - qk * qk, 0));
    const kx = tk * dx + qk * nx;
    const ky = tk * dy + qk * ny;
    if (t > tk && phi > Math.atan2(ky, kx)) d = Math.hypot(x - kx, y - ky) - rc;
  }
  if (s.cornerInner > 0) {
    const rc = s.cornerInner;
    const qk = s.h + rc;
    const tk = Math.sqrt(Math.max((s.r0 + rc) ** 2 - qk * qk, 0));
    const kx = tk * dx + qk * nx;
    const ky = tk * dy + qk * ny;
    if (t < tk && phi > Math.atan2(ky, kx)) d = Math.hypot(x - kx, y - ky) - rc;
  }
  return d;
}

/**
 * Tight bounding box `[minX, minY, maxX, maxY]` (px, relative to the center, y-up) of the unpadded
 * annular sector — a superset of the padded / rounded wedge. Includes the four corners and every
 * axis extreme of the outer arc that falls inside the span.
 */
export function arcBounds(s: ArcShape): [number, number, number, number] {
  if (s.h < 0) return [-s.r1, -s.r1, s.r1, s.r1];
  const start = s.mid - s.half;
  const end = s.mid + s.half;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (r: number, a: number): void => {
    const x = r * Math.cos(a);
    const y = r * Math.sin(a);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  add(s.r1, start);
  add(s.r1, end);
  add(s.r0, start);
  add(s.r0, end);
  const quarter = Math.PI / 2;
  for (let k = Math.ceil(start / quarter); k * quarter <= end; k++) add(s.r1, k * quarter);
  return [minX, minY, maxX, maxY];
}

/** Packed per-instance arrays (see {@link packArcs}). */
export interface PackedArcs {
  origin: Vec3;
  /** RTC centers, 3 per wedge (zeros for non-finite centers). */
  center: Float32Array;
  /** Bounding box relative to the center, 4 per wedge (all zeros = not drawn). */
  bounds: Float32Array;
  /** r0, r1, mid, half — 4 per wedge. */
  shape: Float32Array;
  /** h, outer corner, inner corner — 3 per wedge. */
  corner: Float32Array;
}

/** Number of wedges described by the center arrays (the shorter one). */
export function arcCount(data: Pick<ArcData, 'x' | 'y'>): number {
  return Math.min(data.x.length, data.y.length);
}

/** Pack RTC centers (relative to the center of their finite bounding box). */
export function packArcCenters(
  data: Pick<ArcData, 'x' | 'y' | 'z'>,
  count: number,
  out: Float32Array = new Float32Array(count * 3),
): { origin: Vec3; center: Float32Array } {
  const zs = data.z && data.z.length > 0 ? data.z : undefined;
  const origin = computeOrigin(data.x, data.y, zs);
  for (let i = 0; i < count; i++) {
    const x = data.x[i]!;
    const y = data.y[i]!;
    const z = zs ? zs[Math.min(i, zs.length - 1)]! : 0;
    const ok = Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);
    out[i * 3] = ok ? x - origin[0] : 0;
    out[i * 3 + 1] = ok ? y - origin[1] : 0;
    out[i * 3 + 2] = ok ? z - origin[2] : 0;
  }
  return { origin, center: out };
}

/**
 * Resolve every wedge's shape ({@link computeArcShape}) and bounds ({@link arcBounds}) into the
 * `iShape` / `iCorner` / `iBounds` layouts. Wedges with a non-finite center or an empty shape get
 * zero bounds, which the vertex shader culls.
 */
export function packArcShapes(
  data: Pick<ArcData, 'x' | 'y' | (typeof SHAPE_KEYS)[number]>,
  count: number,
  out?: { shape: Float32Array; corner: Float32Array; bounds: Float32Array },
): { shape: Float32Array; corner: Float32Array; bounds: Float32Array } {
  const shape = out?.shape ?? new Float32Array(count * 4);
  const corner = out?.corner ?? new Float32Array(count * 3);
  const bounds = out?.bounds ?? new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const s = computeArcShape({
      innerRadius: scalarAt(data.innerRadius, i),
      outerRadius: scalarAt(data.outerRadius, i),
      startAngle: scalarAt(data.startAngle, i),
      endAngle: scalarAt(data.endAngle, i),
      cornerRadius: scalarAt(data.cornerRadius, i),
      padAngle: scalarAt(data.padAngle, i),
      padRadius: scalarAt(data.padRadius, i),
    });
    const centerOk = Number.isFinite(data.x[i]!) && Number.isFinite(data.y[i]!);
    if (!s || !centerOk) {
      shape.fill(0, i * 4, i * 4 + 4);
      corner.fill(0, i * 3, i * 3 + 3);
      bounds.fill(0, i * 4, i * 4 + 4);
      continue;
    }
    shape[i * 4] = s.r0;
    shape[i * 4 + 1] = s.r1;
    // Reduce the bisector angle so float32 keeps its precision.
    shape[i * 4 + 2] = s.mid - TAU * Math.round(s.mid / TAU);
    shape[i * 4 + 3] = s.half;
    corner[i * 3] = s.h;
    corner[i * 3 + 1] = s.cornerOuter;
    corner[i * 3 + 2] = s.cornerInner;
    bounds.set(arcBounds(s), i * 4);
  }
  return { shape, corner, bounds };
}

/** Convenience: pack everything for `data` (used by tests and tooling). */
export function packArcs(
  data: Pick<ArcData, 'x' | 'y' | 'z' | (typeof SHAPE_KEYS)[number]>,
): PackedArcs {
  const count = arcCount(data);
  const { origin, center } = packArcCenters(data, count);
  return { origin, center, ...packArcShapes(data, count) };
}

interface ArcBuffers {
  capacity: number;
  geometry: InstancedBufferGeometry;
  release(): void;
  center: InstancedBufferAttribute;
  bounds: InstancedBufferAttribute;
  shape: InstancedBufferAttribute;
  corner: InstancedBufferAttribute;
  fill: InstancedBufferAttribute;
  borderColor: InstancedBufferAttribute;
  borderWidth: InstancedBufferAttribute;
}

/**
 * Instanced, anti-aliased annular sectors (pie / donut / gauge wedges) in a single draw call.
 * Style-only updates (`fill`, `borderColor`, `borderWidth`) re-upload only that attribute; shape
 * updates (radii, angles, pad, corners) re-upload the shape + bounds; center updates the centers.
 */
export class ArcPrimitive implements Primitive<ArcData> {
  /** The mesh to add to a scene. */
  readonly object: Mesh;
  private readonly ctx: PrimitiveContext;
  private readonly material: ShaderMaterial;
  private readonly transformUniforms = createTransformUniforms();
  private readonly viewportUniforms = createViewportUniforms();
  private readonly data: ArcData;
  private buffers: ArcBuffers | undefined;
  private count = 0;
  private origin: Vec3 = [0, 0, 0];
  private transform: DataTransform = IDENTITY_TRANSFORM;
  private disposed = false;

  constructor(ctx: PrimitiveContext, data: Partial<ArcData> = {}) {
    this.ctx = ctx;
    const empty = new Float64Array(0);
    this.data = { x: empty, y: empty, ...DEFAULTS };
    this.material = createPrimitiveMaterial({
      vertexShader: ARC_VERTEX_SHADER,
      fragmentShader: ARC_FRAGMENT_SHADER,
      uniforms: {
        ...this.transformUniforms,
        ...this.viewportUniforms,
        uOpacity: { value: 1 },
      },
    });
    this.buffers = this.allocate(16);
    this.object = new Mesh(this.buffers.geometry, this.material);
    // Centers are RTC-encoded and quads expanded in the shader: three's bounds would be wrong.
    this.object.frustumCulled = false;
    this.update(data);
  }

  /** Number of wedge instances currently drawn. */
  get instanceCount(): number {
    return this.count;
  }

  update(patch: Partial<ArcData>): void {
    if (this.disposed) return;
    const data = this.data as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) data[key] = value;
    }
    const count = arcCount(this.data);
    let b = this.buffers!;
    if (count > b.capacity) b = this.reallocate(count);
    const all = count !== this.count || b !== this.buffers;
    this.buffers = b;
    this.count = count;
    b.geometry.instanceCount = count;

    const centerChanged = CENTER_KEYS.some((k) => patch[k] !== undefined);
    if (all || centerChanged) {
      this.origin = packArcCenters(this.data, count, b.center.array as Float32Array).origin;
      markRange(b.center, count);
      applyTransformUniforms(this.transformUniforms, this.transform, this.origin);
    }
    // Shapes depend on the centers too (non-finite centers are culled through empty bounds).
    if (all || centerChanged || SHAPE_KEYS.some((k) => patch[k] !== undefined)) {
      packArcShapes(this.data, count, {
        shape: b.shape.array as Float32Array,
        corner: b.corner.array as Float32Array,
        bounds: b.bounds.array as Float32Array,
      });
      markRange(b.shape, count);
      markRange(b.corner, count);
      markRange(b.bounds, count);
    }
    if (all || patch.fill !== undefined) {
      expandColor(this.data.fill, count, b.fill.array as Float32Array);
      markRange(b.fill, count);
    }
    if (all || patch.borderColor !== undefined) {
      expandColor(this.data.borderColor, count, b.borderColor.array as Float32Array);
      markRange(b.borderColor, count);
    }
    if (all || patch.borderWidth !== undefined) {
      expandScalar(this.data.borderWidth, count, 0, b.borderWidth.array as Float32Array);
      markRange(b.borderWidth, count);
    }
    this.material.uniforms.uOpacity!.value = this.data.opacity;
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

  private reallocate(count: number): ArcBuffers {
    const old = this.buffers!;
    // Acquire before releasing so the shared unit quad is never disposed in between.
    const next = this.allocate(Math.max(count, old.capacity * 2));
    this.object.geometry = next.geometry;
    old.release();
    return next;
  }

  private allocate(capacity: number): ArcBuffers {
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
      center: attr('iCenter', 3),
      bounds: attr('iBounds', 4),
      shape: attr('iShape', 4),
      corner: attr('iCorner', 3),
      fill: attr('iFill', 4),
      borderColor: attr('iBorderColor', 4),
      borderWidth: attr('iBorderWidth', 1),
    };
  }
}

/** Upload only the used prefix of an instance attribute. */
function markRange(attribute: InstancedBufferAttribute, count: number): void {
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, Math.min(attribute.array.length, count * attribute.itemSize));
  attribute.needsUpdate = true;
}

/** Create an {@link ArcPrimitive}. */
export function createArcPrimitive(
  ctx: PrimitiveContext,
  data: Partial<ArcData> = {},
): ArcPrimitive {
  return new ArcPrimitive(ctx, data);
}
