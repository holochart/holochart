/**
 * Screen-space instanced line primitive (plan E2.5).
 *
 * - One draw call for any number of polylines: one instance per segment, reading
 *   `(prev, A, B, next)` from a single sentinel-separated vertex stream (see `line-buffers.ts`).
 * - Joins (miter / round / bevel with miter limit) and caps (butt / round / square) are evaluated
 *   per fragment as signed distances with an exact ownership split at each join, so translucent
 *   lines have no double-blended seams (see `line-join.ts`).
 * - Width is in CSS px (per segment), colors are per vertex (interpolated along each segment for
 *   colorscale lines), positions are RTC-encoded data coordinates mapped through the
 *   {@link DataTransform}; works with the 2D pixel camera and with 3D cameras (near-plane clipped).
 *
 * ## Dash phase under zoom (design choice)
 *
 * Dash patterns are in screen px, so the phase at each vertex depends on the current *screen*
 * length of everything before it. It is recomputed on the CPU (float64, O(n)) whenever the
 * screen mapping changes: synchronously on data/dash updates, and through a leading+trailing
 * throttle (default 50 ms) on `setTransform` and on camera changes detected in `onBeforeRender`.
 * The stored per-vertex phase is taken modulo the pattern period so long lines keep sub-pixel
 * precision. Between a zoom step and the trailing recompute, the shader rescales each segment's
 * dash coordinate by `storedLength / currentLength`: the phase stays continuous at every vertex
 * and only dash *lengths* drift briefly, then snap back exactly. Solid lines skip all of this.
 * In 3D the phase uses projected screen lengths too, so dashes stay px-sized at any depth.
 */
import {
  BufferGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Matrix4,
  Mesh,
  type Camera,
  type InstancedBufferGeometry,
  type ShaderMaterial,
} from 'three';
import type {
  ColorInput,
  DataTransform,
  Primitive,
  PrimitiveContext,
  ScalarInput,
  ViewportSize,
} from '../types.ts';
import { IDENTITY_TRANSFORM } from '../types.ts';
import {
  acquireInstancedGeometry,
  applyTransformUniforms,
  applyViewportUniforms,
  createPrimitiveMaterial,
  createTransformUniforms,
  createViewportUniforms,
  type Vec3,
} from './common.ts';
import {
  buildLineLayout,
  computeDashDistances,
  createThrottle,
  fillLineColors,
  fillLineWidths,
  PIXEL_SCREEN_MATRIX,
  type LineGeometryInput,
  type LineLayout,
  type ThrottleClock,
} from './line-buffers.ts';
import {
  dashDependsOnViewport,
  dashPeriod,
  MAX_DASH_ENTRIES,
  resolveDashPattern,
  type LineDash,
} from './line-dash.ts';
import { CAP_CODE, JOIN_CODE, type LineCap, type LineJoin } from './line-join.ts';
import { LINE_FRAGMENT_SHADER, LINE_VERTEX_SHADER } from './line.glsl.ts';

/** Data accepted by {@link LinePrimitive}. */
export interface LineData extends LineGeometryInput {
  /** Per-point sRGB RGBA colors (interpolated along segments) or one color. Default opaque black. */
  color: ColorInput;
  /** Width in CSS px: one value, or per point (styles the segment leaving that point). Default 2. */
  width: ScalarInput;
  /** Dash style (Plotly `line.dash` semantics). Default `'solid'`. */
  dash: LineDash;
  /** Default `'miter'`. */
  join: LineJoin;
  /** Default `'butt'` (SVG / Plotly default). Also applies to dash ends. */
  cap: LineCap;
  /** SVG miter limit (miter length / width). Default 4. */
  miterLimit: number;
  /** Multiplies every color's alpha. Default 1. */
  opacity: number;
}

/** Construction options for {@link LinePrimitive}. */
export interface LineOptions {
  /** Min interval between dash-phase recomputes during zoom/camera motion. Default 50 ms. */
  dashThrottleMs?: number;
  /** Clock override (tests). */
  clock?: ThrottleClock;
}

const LINE_QUAD_KEY = 'holochart:primitives:line-quad';

function createLineQuadTemplate(): BufferGeometry {
  const geometry = new BufferGeometry();
  // x: 0 = segment start end, 1 = segment end; y: side (-1 / +1).
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute([0, -1, 0, 1, -1, 0, 0, 1, 0, 1, 1, 0], 3),
  );
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  return geometry;
}

const DEFAULTS: Omit<LineData, 'x' | 'y'> = {
  color: [0, 0, 0, 1],
  width: 2,
  dash: 'solid',
  join: 'miter',
  cap: 'butt',
  miterLimit: 4,
  opacity: 1,
};

const GEOMETRY_KEYS = ['x', 'y', 'z', 'starts', 'connectGaps'] as const;

interface StreamBuffers {
  capacity: number;
  release(): void;
  geometry: InstancedBufferGeometry;
  source: Int32Array;
  points: Float32Array;
  colors: Float32Array;
  widths: Float32Array;
  dist: Float32Array;
  pointsBuffer: InstancedInterleavedBuffer;
  colorBuffer: InstancedInterleavedBuffer;
  widthBuffer: InstancedInterleavedBuffer;
  distBuffer: InstancedInterleavedBuffer;
}

/**
 * Thick anti-aliased polylines with joins, caps, dashes, per-vertex color and per-segment width,
 * drawn in a single instanced draw call.
 */
export class LinePrimitive implements Primitive<LineData> {
  /** The mesh to add to a scene. */
  readonly object: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  private readonly ctx: PrimitiveContext;
  private readonly material: ShaderMaterial;
  private readonly transformUniforms = createTransformUniforms();
  private readonly viewportUniforms = createViewportUniforms();
  private readonly data: LineData;
  private buffers: StreamBuffers | undefined;
  private layout: LineLayout | undefined;
  private transform: DataTransform = IDENTITY_TRANSFORM;
  private viewport: ViewportSize = { width: 1, height: 1, pixelRatio: 1 };
  private dashPattern: number[] = [];
  private readonly screenMatrix = Float64Array.from(PIXEL_SCREEN_MATRIX);
  private readonly throttle: ReturnType<typeof createThrottle>;
  private readonly tmpMatrix = new Matrix4();
  private disposed = false;

  constructor(ctx: PrimitiveContext, data: Partial<LineData> = {}, options: LineOptions = {}) {
    this.ctx = ctx;
    this.data = { x: new Float64Array(0), y: new Float64Array(0), ...DEFAULTS };
    this.material = createPrimitiveMaterial({
      vertexShader: LINE_VERTEX_SHADER,
      fragmentShader: LINE_FRAGMENT_SHADER,
      uniforms: {
        ...this.transformUniforms,
        ...this.viewportUniforms,
        uJoin: { value: 0 },
        uCap: { value: 0 },
        uMiterLimit: { value: 4 },
        uOpacity: { value: 1 },
        uDash: { value: new Float32Array(MAX_DASH_ENTRIES) },
        uDashCount: { value: 0 },
        uDashPeriod: { value: 0 },
      },
    });
    this.throttle = createThrottle(
      () => {
        if (this.disposed) return;
        this.recomputeDashDistances();
        this.ctx.invalidate();
      },
      options.dashThrottleMs ?? 50,
      options.clock,
    );
    this.buffers = this.allocate(16);
    this.object = new Mesh(this.buffers.geometry, this.material);
    // Positions are RTC-encoded and expanded in the shader: three's bounds would be wrong.
    this.object.frustumCulled = false;
    this.object.onBeforeRender = (_renderer, _scene, camera) => this.beforeRender(camera);
    this.update(data);
  }

  /** Number of segment instances currently drawn (including culled gap instances). */
  get instanceCount(): number {
    return this.layout?.instanceCount ?? 0;
  }

  update(patch: Partial<LineData>): void {
    const data = this.data as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) data[key] = value;
    }
    const geometryChanged =
      this.layout === undefined || GEOMETRY_KEYS.some((k) => patch[k] !== undefined);
    const b = this.buffers!;

    if (geometryChanged) {
      const layout = buildLineLayout(this.data, { source: b.source, points: b.points });
      const buffers = layout.points === b.points ? b : this.reallocate(layout);
      this.layout = layout;
      buffers.geometry.instanceCount = layout.instanceCount;
      markRange(buffers.pointsBuffer, layout.vertexCount);
      applyTransformUniforms(this.transformUniforms, this.transform, layout.origin);
    }
    const buffers = this.buffers!;
    const layout = this.layout!;

    if (geometryChanged || patch.color !== undefined) {
      fillLineColors(layout, this.data.color, buffers.colors);
      markRange(buffers.colorBuffer, layout.vertexCount);
    }
    if (geometryChanged || patch.width !== undefined) {
      fillLineWidths(layout, this.data.width, buffers.widths);
      markRange(buffers.widthBuffer, layout.vertexCount);
    }
    if (geometryChanged || patch.dash !== undefined || patch.width !== undefined) {
      this.updateDash();
    }

    const u = this.material.uniforms;
    u.uJoin!.value = JOIN_CODE[this.data.join];
    u.uCap!.value = CAP_CODE[this.data.cap];
    u.uMiterLimit!.value = Math.max(1, this.data.miterLimit);
    u.uOpacity!.value = this.data.opacity;
    this.ctx.invalidate();
  }

  setTransform(transform: DataTransform): void {
    this.transform = transform;
    applyTransformUniforms(this.transformUniforms, transform, this.layout?.origin ?? [0, 0, 0]);
    if (this.dashPattern.length > 0) this.throttle.request();
    this.ctx.invalidate();
  }

  setViewport(size: ViewportSize): void {
    this.viewport = { ...size };
    applyViewportUniforms(this.viewportUniforms, size);
    if (dashDependsOnViewport(this.data.dash)) this.updateDash();
    this.ctx.invalidate();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.throttle.cancel();
    this.object.removeFromParent();
    this.buffers?.release();
    this.buffers = undefined;
    this.material.dispose();
  }

  private updateDash(): void {
    const width = this.data.width;
    let maxWidth = 0;
    if (typeof width === 'number') maxWidth = width;
    else for (let i = 0; i < width.length; i++) maxWidth = Math.max(maxWidth, width[i]!);
    this.dashPattern = resolveDashPattern(this.data.dash, maxWidth, this.viewport);
    const u = this.material.uniforms;
    const arr = u.uDash!.value as Float32Array;
    arr.fill(0);
    arr.set(this.dashPattern);
    u.uDashCount!.value = this.dashPattern.length;
    u.uDashPeriod!.value = dashPeriod(this.dashPattern);
    this.throttle.cancel();
    this.recomputeDashDistances();
  }

  private recomputeDashDistances(): void {
    const buffers = this.buffers;
    const layout = this.layout;
    if (!buffers || !layout || this.dashPattern.length === 0) return;
    const t = this.transform;
    const scale: Vec3 = [t.scaleX, t.scaleY, t.scaleZ ?? 1];
    const offset: Vec3 = [t.offsetX, t.offsetY, t.offsetZ ?? 0];
    computeDashDistances(
      layout,
      this.data,
      { scale, offset },
      this.screenMatrix,
      dashPeriod(this.dashPattern),
      buffers.dist,
    );
    markRange(buffers.distBuffer, layout.vertexCount);
  }

  /** Detect camera changes (3D) that alter screen-space lengths and refresh the dash phase. */
  private beforeRender(camera: Camera): void {
    if (this.dashPattern.length === 0) return;
    const m = this.tmpMatrix
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      .multiply(this.object.matrixWorld);
    // Viewport transform: NDC → CSS px (applied before the w divide).
    const hw = this.viewportUniforms.uResolution.value.x / 2;
    const hh = this.viewportUniforms.uResolution.value.y / 2;
    const e = m.elements;
    let changed = false;
    for (let col = 0; col < 4; col++) {
      const x = hw * e[col * 4]! + hw * e[col * 4 + 3]!;
      const y = hh * e[col * 4 + 1]! + hh * e[col * 4 + 3]!;
      const w = e[col * 4 + 3]!;
      const vals = [x, y, w];
      const rows = [0, 1, 3];
      for (let r = 0; r < 3; r++) {
        const idx = col * 4 + rows[r]!;
        const prev = this.screenMatrix[idx]!;
        const next = vals[r]!;
        if (Math.abs(prev - next) > 1e-7 * Math.max(1, Math.abs(prev), Math.abs(next))) {
          this.screenMatrix[idx] = next;
          changed = true;
        }
      }
    }
    // Attribute uploads for this frame already happened; the throttled run invalidates again.
    if (changed) this.throttle.request();
  }

  private reallocate(layout: LineLayout): StreamBuffers {
    const old = this.buffers!;
    const next = this.allocate(layout.source.length, layout);
    this.object.geometry = next.geometry;
    old.release();
    this.buffers = next;
    return next;
  }

  private allocate(capacity: number, layout?: LineLayout): StreamBuffers {
    const handle = acquireInstancedGeometry(
      this.ctx.resources,
      LINE_QUAD_KEY,
      createLineQuadTemplate,
    );
    const geometry = handle.geometry;
    const source = layout?.source ?? new Int32Array(capacity);
    const points = layout?.points ?? new Float32Array(capacity * 4);
    const colors = new Float32Array(capacity * 4);
    const widths = new Float32Array(capacity);
    const dist = new Float32Array(capacity * 2);

    const pointsBuffer = new InstancedInterleavedBuffer(points, 4, 1);
    const colorBuffer = new InstancedInterleavedBuffer(colors, 4, 1);
    const widthBuffer = new InstancedInterleavedBuffer(widths, 1, 1);
    const distBuffer = new InstancedInterleavedBuffer(dist, 2, 1).setUsage(DynamicDrawUsage);
    // Offsets past the stride make instance k read stream vertex k + offset / stride.
    geometry.setAttribute('aPrev', new InterleavedBufferAttribute(pointsBuffer, 4, 0));
    geometry.setAttribute('aA', new InterleavedBufferAttribute(pointsBuffer, 4, 4));
    geometry.setAttribute('aB', new InterleavedBufferAttribute(pointsBuffer, 4, 8));
    geometry.setAttribute('aNext', new InterleavedBufferAttribute(pointsBuffer, 4, 12));
    geometry.setAttribute('aColorA', new InterleavedBufferAttribute(colorBuffer, 4, 4));
    geometry.setAttribute('aColorB', new InterleavedBufferAttribute(colorBuffer, 4, 8));
    geometry.setAttribute('aWidth', new InterleavedBufferAttribute(widthBuffer, 1, 1));
    geometry.setAttribute('aDist', new InterleavedBufferAttribute(distBuffer, 2, 2));
    geometry.instanceCount = 0;
    return {
      capacity,
      release: handle.release,
      geometry,
      source,
      points,
      colors,
      widths,
      dist,
      pointsBuffer,
      colorBuffer,
      widthBuffer,
      distBuffer,
    };
  }
}

/** Upload only the used prefix of a stream buffer. */
function markRange(buffer: InstancedInterleavedBuffer, vertexCount: number): void {
  buffer.clearUpdateRanges();
  buffer.addUpdateRange(0, Math.min(buffer.array.length, vertexCount * buffer.stride));
  buffer.needsUpdate = true;
}
