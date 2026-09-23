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
 *
 * ## Streaming (E7.2) and memory (E16.9)
 *
 * Buffers are sized from an exact vertex count. {@link LinePrimitive.splice} takes new input
 * together with the range of it that is unchanged from the previous input (a rolling window, an
 * append): only the vertices around the unchanged range are rebuilt and uploaded, and the live
 * range slides inside the buffers (the instanced attributes are re-bound at the new offset)
 * instead of moving data. When the buffers run out of room at the end the edit grows toward, the
 * stream is rebuilt once with slack, so a steady stream re-uploads everything only every few
 * hundred frames.
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
  syncViewportUniforms,
  type ViewportSource,
  createTransformUniforms,
  createViewportUniforms,
  type Vec3,
} from './common.ts';
import {
  buildLineLayout,
  computeDashDistances,
  countLineStream,
  createThrottle,
  fillLineColors,
  fillLineWidths,
  lineCursor,
  LineStep,
  PIXEL_SCREEN_MATRIX,
  writeLinePoint,
  writeLineSentinel,
  type LineGeometryInput,
  type LineLayout,
  type LineStreamArrays,
  type ThrottleClock,
} from './line-buffers.ts';
import type { NumericArray } from './common.ts';
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

/**
 * Which part of new input equals the previous input (see {@link LinePrimitive.splice}): input
 * vertices `[at, at + (to - from))` of the new `x`/`y` are vertices `[from, to)` of the previous.
 */
export interface LineRetain {
  readonly from: number;
  readonly to: number;
  readonly at: number;
}

/**
 * Source serial base of streaming rebuilds: far from 0 so prepends (which number new vertices
 * below the retained ones) never reach the sentinel value -1.
 */
const STREAM_BASE = 1 << 30;
/** Retained inputs examined for the head junction before giving up (duplicates, gaps). */
const JUNCTION_LIMIT = 64;

interface StreamBuffers {
  capacity: number;
  /** Head offset the geometry's attributes are bound at. */
  boundHead: number;
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
  /** Scratch for the head of a splice (built front to back, then placed before the retained part). */
  private scratch: LineStreamArrays = { source: new Int32Array(16), points: new Float32Array(64) };
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
    this.object.onBeforeRender = (renderer, _scene, camera) => this.beforeRender(renderer, camera);
    this.update(data);
  }

  /** Number of segment instances currently drawn (including culled gap instances). */
  get instanceCount(): number {
    return this.layout?.instanceCount ?? 0;
  }

  /**
   * The live vertex stream (debugging, tests): first vertex, vertex count, source serial base (see
   * `LineLayout`), the RTC origin and the allocated capacity.
   */
  get stream(): Readonly<{
    head: number;
    vertexCount: number;
    sourceBase: number;
    origin: Readonly<Vec3>;
    capacity: number;
  }> {
    const l = this.layout;
    return {
      head: l?.head ?? 0,
      vertexCount: l?.vertexCount ?? 0,
      sourceBase: l?.sourceBase ?? 0,
      origin: l?.origin ?? [0, 0, 0],
      capacity: this.buffers?.capacity ?? 0,
    };
  }

  update(patch: Partial<LineData>): void {
    const data = this.data as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) data[key] = value;
    }
    const geometryChanged =
      this.layout === undefined || GEOMETRY_KEYS.some((k) => patch[k] !== undefined);

    if (geometryChanged) this.rebuild(0, 0, 0);
    const buffers = this.buffers!;
    const layout = this.layout!;
    const view = streamView(layout);

    if (!geometryChanged && patch.color !== undefined) {
      fillLineColors(view, this.data.color, buffers.colors.subarray(layout.head * 4));
      markRange(buffers.colorBuffer, layout.head, layout.vertexCount);
    }
    if (!geometryChanged && patch.width !== undefined) {
      fillLineWidths(view, this.data.width, buffers.widths.subarray(layout.head));
      markRange(buffers.widthBuffer, layout.head, layout.vertexCount);
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

  /**
   * Streaming geometry update (E7.2): equivalent to `update({ x, y })`, given that input vertices
   * `[retain.at, retain.at + retain.to - retain.from)` of `x`/`y` equal vertices
   * `[retain.from, retain.to)` of the previous input (the caller guarantees it). Only the vertex
   * stream before and after that range is rebuilt and uploaded; the retained vertices stay where
   * they are in the buffers and the live range slides.
   *
   * Falls back to a full update for 3D (`z`), multiple polylines (`starts`), per-point colors or
   * widths, or when the buffers have no room at the growing end (then the stream is rebuilt with
   * slack for the next edits). Dashed lines recompute their phase (O(n) CPU, one small upload).
   */
  splice(x: NumericArray, y: NumericArray, retain: LineRetain): void {
    if (!this.trySplice(x, y, retain)) {
      this.data.x = x;
      this.data.y = y;
      // Room for the next edits at the end the stream grows toward.
      this.rebuild(retain.at > retain.from ? -1 : 1, STREAM_BASE, 1);
      this.updateDash();
    }
    this.ctx.invalidate();
  }

  private trySplice(x: NumericArray, y: NumericArray, retain: LineRetain): boolean {
    const layout = this.layout;
    const b = this.buffers;
    const data = this.data;
    if (!layout || !b || data.z || data.starts) return false;
    if (typeof data.width !== 'number' || data.color instanceof Float32Array) return false;
    const oldN = Math.min(data.x.length, data.y.length);
    const newN = Math.min(x.length, y.length);
    const { from, to, at } = retain;
    if (!(from >= 0 && to > from && to <= oldN && at >= 0 && at + (to - from) <= newN)) {
      return false;
    }
    const base = layout.sourceBase;
    const newBase = base + from - at;
    if (newBase < 0) return false;
    const source = b.source;
    const end0 = layout.head + layout.vertexCount;
    const connect = data.connectGaps === true;
    const origin = layout.origin;

    // Head: rebuild [sentinel, new vertices before the retained range, …] until the builder
    // emits a retained vertex that the old stream also has — from there on both builders are in
    // the same state, so the old stream stays valid.
    let v = layout.head;
    const cursor = lineCursor();
    // Each input writes at most one vertex.
    const scratch = this.ensureScratch(at + JUNCTION_LIMIT + 4);
    writeLineSentinel(cursor, scratch);
    for (let j = 0; j < at; j++) {
      writeLinePoint(cursor, scratch, j + newBase, x[j]!, y[j]!, 0, connect, origin);
    }
    let converged = -1;
    for (let i = from; i < to && i < from + JUNCTION_LIMIT; i++) {
      const serial = i + base;
      while (v < end0 && source[v]! < serial) v++;
      const j = at + i - from;
      const step = writeLinePoint(cursor, scratch, j + newBase, x[j]!, y[j]!, 0, connect, origin);
      if (step === LineStep.Vertex && v < end0 && source[v] === serial) {
        cursor.at--; // the old stream already holds this vertex at `v`
        converged = i;
        break;
      }
    }
    if (converged < 0) return false;
    const headCount = cursor.at;
    const head = v - headCount;
    if (head < 0) return false;

    // Tail: resume after the last retained vertex the old stream drew.
    let u = end0 - 1;
    while (u > v && !(source[u]! >= 0 && source[u]! < to + base)) u--;
    const rOld = source[u]! - base;
    const rNew = at + rOld - from;
    const tail = lineCursor(u + 1);
    tail.started = true;
    tail.lastValid = true;
    tail.lx = x[rNew]!;
    tail.ly = y[rNew]!;
    // Count first: the tail must fit before the end of the buffers.
    const probe = { ...tail };
    for (let j = rNew + 1; j < newN; j++) {
      writeLinePoint(probe, undefined, 0, x[j]!, y[j]!, 0, connect, origin);
    }
    writeLineSentinel(probe, undefined);
    if (probe.at > b.capacity) return false;

    const out = { source: b.source, points: b.points };
    for (let j = rNew + 1; j < newN; j++) {
      writeLinePoint(tail, out, j + newBase, x[j]!, y[j]!, 0, connect, origin);
    }
    writeLineSentinel(tail, out);
    const end = tail.at;
    b.source.set(scratch.source.subarray(0, headCount), head);
    b.points.set(scratch.points.subarray(0, headCount * 4), head * 4);

    data.x = x;
    data.y = y;
    layout.head = head;
    layout.vertexCount = end - head;
    layout.instanceCount = Math.max(0, layout.vertexCount - 3);
    layout.sourceBase = newBase;

    // Uniform color and width: fill only the rewritten vertices.
    const headView = { vertexCount: headCount, source: source.subarray(head), sourceBase: newBase };
    const tailView = {
      vertexCount: end - u - 1,
      source: source.subarray(u + 1),
      sourceBase: newBase,
    };
    fillLineColors(headView, data.color, b.colors.subarray(head * 4));
    fillLineColors(tailView, data.color, b.colors.subarray((u + 1) * 4));
    fillLineWidths(headView, data.width, b.widths.subarray(head));
    fillLineWidths(tailView, data.width, b.widths.subarray(u + 1));
    for (const buffer of [b.pointsBuffer, b.colorBuffer, b.widthBuffer]) {
      buffer.clearUpdateRanges();
      addRange(buffer, head, headCount);
      addRange(buffer, u + 1, end - u - 1);
      buffer.needsUpdate = true;
    }
    this.bind(b, head);
    b.geometry.instanceCount = layout.instanceCount;
    if (this.dashPattern.length > 0) {
      this.throttle.cancel();
      this.recomputeDashDistances();
    }
    return true;
  }

  /**
   * Rebuild the whole stream from `this.data`. `slack` 0 sizes buffers exactly (E16.9), reusing
   * them when they are no more than twice the need; otherwise room for about as many vertices
   * again is left at the end (`bias` 1, appends) or the start (`bias` -1, prepends).
   */
  private rebuild(bias: -1 | 0 | 1, sourceBase: number, slack: 0 | 1): void {
    const count = countLineStream(this.data);
    const b = this.buffers!;
    const room = slack ? count + 64 : 0;
    const capacity = count + room;
    const reuse = b.capacity >= capacity && b.capacity <= 2 * capacity + 64;
    const offset = bias < 0 ? (reuse ? b.capacity : capacity) - count : 0;
    const layout = buildLineLayout(
      this.data,
      reuse ? { source: b.source, points: b.points } : undefined,
      { count, offset, sourceBase, capacity },
    );
    const buffers = reuse ? b : this.reallocate(layout);
    this.layout = layout;
    const view = streamView(layout);
    fillLineColors(view, this.data.color, buffers.colors.subarray(layout.head * 4));
    fillLineWidths(view, this.data.width, buffers.widths.subarray(layout.head));
    for (const buffer of [buffers.pointsBuffer, buffers.colorBuffer, buffers.widthBuffer]) {
      markRange(buffer, layout.head, layout.vertexCount);
    }
    this.bind(buffers, layout.head);
    buffers.geometry.instanceCount = layout.instanceCount;
    applyTransformUniforms(this.transformUniforms, this.transform, layout.origin);
  }

  private ensureScratch(vertices: number): LineStreamArrays {
    if (this.scratch.source.length < vertices) {
      const n = Math.max(vertices, 2 * this.scratch.source.length);
      this.scratch = { source: new Int32Array(n), points: new Float32Array(4 * n) };
    }
    return this.scratch;
  }

  /**
   * Point the instanced attributes at stream vertex `head`. three.js caches vertex-array state
   * per attribute object, so a new offset needs new attribute objects (the buffers are shared:
   * nothing is re-uploaded).
   */
  private bind(b: StreamBuffers, head: number): void {
    if (b.boundHead === head) return;
    b.boundHead = head;
    setStreamAttributes(b, head);
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
      streamView(layout),
      this.data,
      { scale, offset },
      this.screenMatrix,
      dashPeriod(this.dashPattern),
      buffers.dist.subarray(layout.head * 2),
    );
    markRange(buffers.distBuffer, layout.head, layout.vertexCount);
  }

  /**
   * Sync the viewport uniforms with the GL viewport, then detect camera changes (3D) that alter
   * screen-space lengths and refresh the dash phase.
   */
  private beforeRender(renderer: ViewportSource, camera: Camera): void {
    if (syncViewportUniforms(this.viewportUniforms, renderer)) {
      const resolution = this.viewportUniforms.uResolution.value;
      this.viewport = {
        width: resolution.x,
        height: resolution.y,
        pixelRatio: this.viewportUniforms.uPixelRatio.value,
      };
      if (dashDependsOnViewport(this.data.dash)) this.updateDash();
    }
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
    geometry.instanceCount = 0;
    const buffers: StreamBuffers = {
      capacity,
      boundHead: 0,
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
    setStreamAttributes(buffers, 0);
    return buffers;
  }
}

/** The live part of a layout, for the fill functions (which index from 0). */
function streamView(layout: LineLayout) {
  return {
    vertexCount: layout.vertexCount,
    source: layout.source.subarray(layout.head),
    sourceBase: layout.sourceBase,
  };
}

/** Upload only `[start, start + count)` (stream vertices) of a stream buffer. */
function markRange(buffer: InstancedInterleavedBuffer, start: number, count: number): void {
  buffer.clearUpdateRanges();
  addRange(buffer, start, count);
  buffer.needsUpdate = true;
}

function addRange(buffer: InstancedInterleavedBuffer, start: number, count: number): void {
  const s = start * buffer.stride;
  const n = Math.min(buffer.array.length - s, count * buffer.stride);
  if (n > 0) buffer.addUpdateRange(s, n);
}

/**
 * (Re)create the instanced attributes reading the stream from vertex `head`: instance `k` reads
 * `(prev, A, B, next)` = stream vertices `head + k … head + k + 3` (offsets past the stride).
 */
function setStreamAttributes(b: StreamBuffers, head: number): void {
  const g = b.geometry;
  const p = head * 4;
  g.setAttribute('aPrev', new InterleavedBufferAttribute(b.pointsBuffer, 4, p));
  g.setAttribute('aA', new InterleavedBufferAttribute(b.pointsBuffer, 4, p + 4));
  g.setAttribute('aB', new InterleavedBufferAttribute(b.pointsBuffer, 4, p + 8));
  g.setAttribute('aNext', new InterleavedBufferAttribute(b.pointsBuffer, 4, p + 12));
  g.setAttribute('aColorA', new InterleavedBufferAttribute(b.colorBuffer, 4, p + 4));
  g.setAttribute('aColorB', new InterleavedBufferAttribute(b.colorBuffer, 4, p + 8));
  g.setAttribute('aWidth', new InterleavedBufferAttribute(b.widthBuffer, 1, head + 1));
  g.setAttribute('aDist', new InterleavedBufferAttribute(b.distBuffer, 2, 2 * head + 2));
}
