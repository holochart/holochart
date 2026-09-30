/**
 * 3D polyline primitive (plan E14.2, the render part of `scatter3d` lines): screen-space thick lines
 * in a perspective (or orthographic) 3D camera, in the lazily loaded 3D chunk
 * (`lines-markers-3d.ts`).
 *
 * ## Rendering
 *
 * The same instanced sentinel stream as the 2D {@link LinePrimitive} (`line-buffers.ts`: one
 * instance per segment reading `(prev, A, B, next)`, NaN gaps, `starts`, `connectGaps`) and the same
 * fragment shader (miter / round / bevel joins with an exact ownership split, caps, Plotly dashes,
 * hairlines), with the 3D vertex stage of `line3d.glsl.ts`: each segment is projected, clipped
 * against the near plane in clip space before the perspective divide, and expanded in screen px.
 * Widths and dash lengths are CSS px at every depth; the depth of the expanded quad is interpolated
 * linearly in screen space (exact for a projected straight segment), so lines depth-test against
 * every other object of the scene. Colors are per vertex (interpolate along each segment; map a
 * colorscale on the CPU, as 2D scatter lines do) or one color.
 *
 * Blending (`blend3d.ts`): opaque lines (the default look: opacity and color alphas at 1) write
 * depth with alpha to coverage, so they occlude and are occluded by markers, spheres and meshes in
 * any draw order; translucent lines blend without writing depth.
 *
 * ## Dashes in 3D
 *
 * The dash phase is the screen length of the visible polyline so far, recomputed on the CPU in
 * float64 (`computeDashDistances3D`, O(n)) whenever the camera, the transform, the viewport or the
 * data change: synchronously for data changes, and through a leading + trailing throttle (default
 * 50 ms) while the camera moves, exactly like 2D zoom. Call {@link Line3D.syncCamera} before the
 * first frame to have dashes right in that frame (otherwise they settle one frame later). Solid
 * lines skip all of this.
 *
 * ## Picking (E2.13)
 *
 * A pickable primitive: its pick material writes, per fragment, the input index of the nearer
 * vertex of the segment (`pickKind: 'point'`, `pickCount` = number of input points), so
 * `GpuPicker` hits on a line report the point to hover.
 */
import {
  BufferGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  GLSL3,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Matrix4,
  Mesh,
  NoBlending,
  ShaderMaterial,
  Vector2,
  Vector4,
  type Camera,
  type InstancedBufferGeometry,
  type IUniform,
} from 'three';
import type {
  PickablePrimitive,
  PickElementKind,
  PickMaterialHandle,
  PickRenderState,
} from '../picking/types.ts';
import {
  IDENTITY_TRANSFORM,
  type DataTransform,
  type Primitive,
  type PrimitiveContext,
  type ViewportSize,
} from '../types.ts';
import {
  acquireInstancedGeometry,
  applyTransformUniforms,
  applyViewportUniforms,
  createPrimitiveMaterial,
  createTransformUniforms,
  createViewportUniforms,
  syncViewportUniforms,
  type ViewportSource,
} from './common.ts';
import {
  buildLineLayout,
  countLineStream,
  createThrottle,
  fillLineColors,
  fillLineWidths,
  type LineLayout,
  type ThrottleClock,
} from './line-buffers.ts';
import {
  dashDependsOnViewport,
  dashPeriod,
  MAX_DASH_ENTRIES,
  resolveDashPattern,
} from './line-dash.ts';
import { CAP_CODE, JOIN_CODE } from './line-join.ts';
import { applyBlend3D, colorsOpaque, isOpaque, type Blend3D } from './blend3d.ts';
import type { LineData } from './line.ts';
import { computeDashDistances3D, LINE3D_QUAD_INDEX, LINE3D_QUAD_POSITIONS } from './line3d-math.ts';
import { LINE3D_FRAGMENT_SHADER, LINE3D_VERTEX_SHADER } from './line3d.glsl.ts';

/**
 * Data of a {@link Line3D}: the 2D line's fields (`x`, `y`, `z`, `starts`, `connectGaps`, `color`,
 * `width`, `dash`, `join`, `cap`, `miterLimit`, `opacity`; see `LineData`). `z` is optional (0).
 */
export type Line3DData = LineData;

/** Construction options of {@link Line3D}. */
export interface Line3DOptions {
  /** Depth test against the scene. Default true. */
  depthTest?: boolean;
  /** Opaque (depth-writing) or translucent drawing; default `'auto'`: from the colors and opacity. */
  blend?: Blend3D;
  /** three.js render order (trace order). */
  renderOrder?: number;
  /** Min interval between dash-phase recomputes while the camera moves. Default 50 ms. */
  dashThrottleMs?: number;
  /** Clock override (tests). */
  clock?: ThrottleClock;
}

const QUAD_KEY = 'holochart:primitives:line3d-quad';

function createQuadTemplate(): BufferGeometry {
  const geometry = new BufferGeometry();
  // x: 0 = segment start end, 1 = segment end; y: side (-1 / +1); z: 1 = on the end point (the
  // exact depth ramp, see `line3d.glsl.ts`), 0 = past it by the join / cap extent.
  geometry.setAttribute('position', new Float32BufferAttribute([...LINE3D_QUAD_POSITIONS], 3));
  geometry.setIndex([...LINE3D_QUAD_INDEX]);
  return geometry;
}

const DEFAULTS: Omit<Line3DData, 'x' | 'y'> = {
  color: [0, 0, 0, 1],
  width: 2,
  dash: 'solid',
  join: 'miter',
  cap: 'butt',
  miterLimit: 4,
  opacity: 1,
};

const GEOMETRY_KEYS = ['x', 'y', 'z', 'starts', 'connectGaps'] as const;

interface Buffers {
  capacity: number;
  release(): void;
  geometry: InstancedBufferGeometry;
  source: Int32Array;
  points: Float32Array;
  colors: Float32Array;
  widths: Float32Array;
  dist: Float32Array;
  all: InstancedInterleavedBuffer[];
  colorBuffer: InstancedInterleavedBuffer;
  widthBuffer: InstancedInterleavedBuffer;
  distBuffer: InstancedInterleavedBuffer;
}

const tmpViewport = new Vector4();

/** Screen-space thick 3D polylines in one instanced draw call (see the module docs). */
export class Line3D implements Primitive<Line3DData>, PickablePrimitive {
  readonly object: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  readonly material: ShaderMaterial;
  /** Pick ids count input points (the nearer vertex of the segment under the cursor). */
  readonly pickKind: PickElementKind = 'point';

  readonly #ctx: PrimitiveContext;
  readonly #transformUniforms = createTransformUniforms();
  readonly #viewportUniforms = createViewportUniforms();
  readonly #data: Line3DData;
  readonly #throttle: ReturnType<typeof createThrottle>;
  /** World → clip matrix the dash phase was computed with (float64, column-major). */
  readonly #clip = new Float64Array(16);
  readonly #tmp = new Matrix4();
  #buffers: Buffers;
  #layout: LineLayout | undefined;
  #transform: DataTransform = IDENTITY_TRANSFORM;
  #viewport: ViewportSize = { width: 1, height: 1, pixelRatio: 1 };
  #dashPattern: number[] = [];
  #blend: Blend3D;
  #opaque: boolean | undefined;
  #disposed = false;

  constructor(ctx: PrimitiveContext, data: Partial<Line3DData> = {}, options: Line3DOptions = {}) {
    this.#ctx = ctx;
    this.#data = { x: new Float64Array(0), y: new Float64Array(0), ...DEFAULTS };
    this.material = createPrimitiveMaterial({
      vertexShader: LINE3D_VERTEX_SHADER,
      fragmentShader: LINE3D_FRAGMENT_SHADER,
      uniforms: {
        ...this.#transformUniforms,
        ...this.#viewportUniforms,
        uJoin: { value: 0 },
        uCap: { value: 0 },
        uMiterLimit: { value: 4 },
        uOpacity: { value: 1 },
        uDash: { value: new Float32Array(MAX_DASH_ENTRIES) },
        uDashCount: { value: 0 },
        uDashPeriod: { value: 0 },
      },
    });
    this.material.name = 'holochart:line3d';
    this.material.depthTest = options.depthTest ?? true;
    this.#blend = options.blend ?? 'auto';
    this.#throttle = createThrottle(
      () => {
        if (this.#disposed) return;
        this.#recomputeDash();
        this.#ctx.invalidate();
      },
      options.dashThrottleMs ?? 50,
      options.clock,
    );
    this.#clip.fill(NaN);
    this.#buffers = this.#allocate(16);
    this.object = new Mesh(this.#buffers.geometry, this.material);
    this.object.name = 'holochart:line3d';
    // Positions are RTC-encoded and expanded in the shader: three's bounds would be wrong.
    this.object.frustumCulled = false;
    if (options.renderOrder !== undefined) this.object.renderOrder = options.renderOrder;
    this.object.onBeforeRender = (renderer, _scene, camera) => this.#beforeRender(renderer, camera);
    this.update(data);
  }

  /** Number of segment instances drawn (including culled gap instances). */
  get instanceCount(): number {
    return this.#layout?.instanceCount ?? 0;
  }

  /** Number of pick ids: one per input point. */
  get pickCount(): number {
    const { x, y, z } = this.#data;
    return Math.min(x.length, y.length, z ? z.length : Infinity);
  }

  update(patch: Partial<Line3DData>): void {
    if (this.#disposed) return;
    const data = this.#data as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) data[key] = value;
    }
    const geometryChanged =
      this.#layout === undefined || GEOMETRY_KEYS.some((k) => patch[k] !== undefined);
    if (geometryChanged) this.#rebuild();
    const b = this.#buffers;
    const layout = this.#layout!;
    if (!geometryChanged && patch.color !== undefined) {
      fillLineColors(layout, this.#data.color, b.colors);
      b.colorBuffer.needsUpdate = true;
    }
    if (!geometryChanged && patch.width !== undefined) {
      fillLineWidths(layout, this.#data.width, b.widths);
      b.widthBuffer.needsUpdate = true;
    }
    if (geometryChanged || patch.dash !== undefined || patch.width !== undefined) {
      this.#updateDash();
    }
    const u = this.material.uniforms;
    u.uJoin!.value = JOIN_CODE[this.#data.join];
    u.uCap!.value = CAP_CODE[this.#data.cap];
    u.uMiterLimit!.value = Math.max(1, this.#data.miterLimit);
    u.uOpacity!.value = this.#data.opacity;
    if (this.#opaque === undefined || patch.color !== undefined || patch.opacity !== undefined) {
      const opaque = isOpaque(
        this.#blend,
        this.#data.opacity >= 1 && colorsOpaque(this.#data.color),
      );
      if (opaque !== this.#opaque) applyBlend3D(this.material, opaque);
      this.#opaque = opaque;
    }
    this.#ctx.invalidate();
  }

  /** Whether the line is drawn opaque (depth-writing, see `blend3d.ts`). */
  get opaque(): boolean {
    return this.#opaque === true;
  }

  setTransform(transform: DataTransform): void {
    this.#transform = { ...transform };
    applyTransformUniforms(this.#transformUniforms, transform, this.#layout?.origin ?? [0, 0, 0]);
    if (this.#dashPattern.length > 0) this.#throttle.request();
    this.#ctx.invalidate();
  }

  setViewport(size: ViewportSize): void {
    this.#viewport = { ...size };
    applyViewportUniforms(this.#viewportUniforms, size);
    if (dashDependsOnViewport(this.#data.dash)) this.#updateDash();
    else if (this.#dashPattern.length > 0) this.#recomputeDash();
    this.#ctx.invalidate();
  }

  /**
   * Bring the dash phase up to date for `camera` now (it is otherwise refreshed from the frames
   * the line is drawn in, one frame late after a change). The camera's world matrices must be
   * current. No-op for solid lines.
   */
  syncCamera(camera: Camera): void {
    if (this.#readCamera(camera)) {
      this.#throttle.cancel();
      this.#recomputeDash();
      this.#ctx.invalidate();
    }
  }

  /**
   * Pick material (E2.13): the same shaders with `PICKING` defined, sharing every uniform except
   * the resolution and viewport (the pick window's) and the pick id base.
   */
  createPickMaterial(): PickMaterialHandle {
    const source = this.material;
    const uniforms: Record<string, IUniform> & {
      uResolution: IUniform<Vector2>;
      uViewport: IUniform<Vector4>;
      uPickBase: IUniform<number>;
    } = {
      ...source.uniforms,
      uResolution: { value: new Vector2(1, 1) },
      uViewport: { value: new Vector4(0, 0, 1, 1) },
      uPickBase: { value: 0 },
    };
    const material = new ShaderMaterial({
      name: 'holochart:line3d:pick',
      glslVersion: GLSL3,
      vertexShader: LINE3D_VERTEX_SHADER,
      fragmentShader: LINE3D_FRAGMENT_SHADER,
      uniforms,
      defines: { PICKING: '' },
      blending: NoBlending,
    });
    // gl_FragCoord is relative to the pick target's viewport.
    material.onBeforeRender = (renderer) => {
      uniforms.uViewport.value.copy(renderer.getCurrentViewport(tmpViewport));
    };
    return {
      material,
      prepare(state: Readonly<PickRenderState>): void {
        uniforms.uPickBase.value = state.base;
        uniforms.uResolution.value.set(
          Math.max(1e-6, state.windowWidth),
          Math.max(1e-6, state.windowHeight),
        );
        material.depthTest = source.depthTest;
        material.depthWrite = source.depthWrite;
        material.transparent = source.transparent;
      },
      dispose(): void {
        material.dispose();
      },
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#throttle.cancel();
    this.object.removeFromParent();
    this.#buffers.release();
    this.material.dispose();
  }

  // ---- internals -------------------------------------------------------------------------

  #rebuild(): void {
    const count = countLineStream(this.#data);
    let b = this.#buffers;
    if (!(b.capacity >= count && b.capacity <= 2 * count + 64)) {
      const next = this.#allocate(count);
      this.object.geometry = next.geometry;
      b.release();
      this.#buffers = b = next;
    }
    const layout = buildLineLayout(this.#data, b, { count });
    this.#layout = layout;
    fillLineColors(layout, this.#data.color, b.colors);
    fillLineWidths(layout, this.#data.width, b.widths);
    for (const buffer of b.all) buffer.needsUpdate = true;
    b.geometry.instanceCount = layout.instanceCount;
    applyTransformUniforms(this.#transformUniforms, this.#transform, layout.origin);
  }

  #updateDash(): void {
    const width = this.#data.width;
    let maxWidth = 0;
    if (typeof width === 'number') maxWidth = width;
    else for (let i = 0; i < width.length; i++) maxWidth = Math.max(maxWidth, width[i]!);
    this.#dashPattern = resolveDashPattern(this.#data.dash, maxWidth, this.#viewport);
    const u = this.material.uniforms;
    const arr = u.uDash!.value as Float32Array;
    arr.fill(0);
    arr.set(this.#dashPattern);
    u.uDashCount!.value = this.#dashPattern.length;
    u.uDashPeriod!.value = dashPeriod(this.#dashPattern);
    this.#throttle.cancel();
    this.#recomputeDash();
  }

  #recomputeDash(): void {
    const layout = this.#layout;
    if (!layout || this.#dashPattern.length === 0 || Number.isNaN(this.#clip[0])) return;
    const t = this.#transform;
    const res = this.#viewportUniforms.uResolution.value;
    computeDashDistances3D(
      layout,
      this.#data,
      {
        scale: [t.scaleX, t.scaleY, t.scaleZ ?? 1],
        offset: [t.offsetX, t.offsetY, t.offsetZ ?? 0],
      },
      this.#clip,
      res.x,
      res.y,
      dashPeriod(this.#dashPattern),
      this.#buffers.dist,
    );
    this.#buffers.distBuffer.needsUpdate = true;
  }

  /** Store camera × model as the dash projection; returns whether it changed (dashed lines). */
  #readCamera(camera: Camera): boolean {
    if (this.#dashPattern.length === 0) return false;
    const e = this.#tmp
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      .multiply(this.object.matrixWorld).elements;
    let changed = false;
    for (let i = 0; i < 16; i++) {
      const prev = this.#clip[i]!;
      const next = e[i]!;
      if (!(Math.abs(prev - next) <= 1e-7 * Math.max(1, Math.abs(prev), Math.abs(next)))) {
        this.#clip[i] = next;
        changed = true;
      }
    }
    return changed;
  }

  /** Sync the viewport uniforms with the GL viewport, then detect camera changes (dashes). */
  #beforeRender(renderer: ViewportSource, camera: Camera): void {
    if (syncViewportUniforms(this.#viewportUniforms, renderer)) {
      const res = this.#viewportUniforms.uResolution.value;
      this.#viewport = {
        width: res.x,
        height: res.y,
        pixelRatio: this.#viewportUniforms.uPixelRatio.value,
      };
      if (dashDependsOnViewport(this.#data.dash)) this.#updateDash();
      else if (this.#dashPattern.length > 0) this.#throttle.request();
    }
    // Attribute uploads for this frame already happened; the throttled run invalidates again.
    if (this.#readCamera(camera)) this.#throttle.request();
  }

  #allocate(capacity: number): Buffers {
    const handle = acquireInstancedGeometry(this.#ctx.resources, QUAD_KEY, createQuadTemplate);
    const geometry = handle.geometry;
    const cap = Math.max(4, capacity);
    const source = new Int32Array(cap);
    const points = new Float32Array(cap * 4);
    const colors = new Float32Array(cap * 4);
    const widths = new Float32Array(cap);
    const dist = new Float32Array(cap * 2);
    const pointsBuffer = new InstancedInterleavedBuffer(points, 4, 1);
    const colorBuffer = new InstancedInterleavedBuffer(colors, 4, 1);
    const widthBuffer = new InstancedInterleavedBuffer(widths, 1, 1);
    const distBuffer = new InstancedInterleavedBuffer(dist, 2, 1).setUsage(DynamicDrawUsage);
    // Int32 source indices: integer attributes for the pick shader (sentinels are -1, never drawn).
    const sourceBuffer = new InstancedInterleavedBuffer(source, 1, 1);
    const attr = (name: string, buffer: InstancedInterleavedBuffer, size: number, at: number) =>
      geometry.setAttribute(name, new InterleavedBufferAttribute(buffer, size, at));
    // Instance k reads stream vertices k … k + 3 as (prev, A, B, next).
    attr('aPrev', pointsBuffer, 4, 0);
    attr('aA', pointsBuffer, 4, 4);
    attr('aB', pointsBuffer, 4, 8);
    attr('aNext', pointsBuffer, 4, 12);
    attr('aColorA', colorBuffer, 4, 4);
    attr('aColorB', colorBuffer, 4, 8);
    attr('aWidth', widthBuffer, 1, 1);
    attr('aDist', distBuffer, 2, 2);
    attr('aSrcA', sourceBuffer, 1, 1);
    attr('aSrcB', sourceBuffer, 1, 2);
    geometry.instanceCount = 0;
    return {
      capacity: cap,
      release: handle.release,
      geometry,
      source,
      points,
      colors,
      widths,
      dist,
      all: [pointsBuffer, colorBuffer, widthBuffer, distBuffer, sourceBuffer],
      colorBuffer,
      widthBuffer,
      distBuffer,
    };
  }
}

/** Create a {@link Line3D}. Add `line.object` to a 3D scene (or `viewport.add(line)`). */
export function createLine3D(
  ctx: PrimitiveContext,
  data: Partial<Line3DData> = {},
  options: Line3DOptions = {},
): Line3D {
  return new Line3D(ctx, data, options);
}
