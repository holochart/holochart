/**
 * Shared contracts for the render layer.
 *
 * Every GPU primitive (markers, lines, fills, rects, arcs, text, meshes) implements {@link Primitive}
 * and is constructed with a {@link PrimitiveContext}. Primitives know nothing about figures, traces,
 * or axes — they draw typed-array data through a {@link DataTransform}.
 *
 * ## Coordinate conventions (ADR-008)
 *
 * - **Data space**: the primitive's input coordinates (already linearized by the caller, e.g. log10
 *   or category index). Supplied as `Float64Array` so large values (ms timestamps) keep precision.
 * - **World space**: what the camera sees. For 2D viewports, world units are CSS pixels with the
 *   origin at the viewport's bottom-left corner, +x right, +y up. For 3D scenes, world space is the
 *   scene's normalized space.
 * - **DataTransform** maps data → world per axis: `world = data * scale + offset`.
 *
 * ## Precision (relative-to-center encoding, plan §E16.4)
 *
 * Primitives subtract a float64 `origin` from positions on the CPU and upload float32 deltas. When a
 * transform is applied, the effective offset is computed in float64 as
 * `offset + origin * scale` and passed to the shader, so zooming into a 1-second window of
 * millisecond timestamps stays exact.
 *
 * ## Screen-space sizing
 *
 * Marker sizes, line widths, and border widths are in CSS pixels. Vertex shaders project the
 * world-space anchor with `projectionMatrix * modelViewMatrix` and then expand in clip space using
 * the `uResolution` / `uPixelRatio` uniforms (set through {@link Primitive.setViewport}). This works
 * for both the 2D pixel-space orthographic camera and 3D perspective cameras.
 */
import type { BufferGeometry, Material, Object3D, Texture } from 'three';

/** Affine map from data space to world space, per axis: `world = data * scale + offset`. */
export interface DataTransform {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  /** Optional third axis for 3D usage. Defaults: scaleZ = 1, offsetZ = 0. */
  scaleZ?: number;
  offsetZ?: number;
}

export const IDENTITY_TRANSFORM: Readonly<DataTransform> = Object.freeze({
  scaleX: 1,
  scaleY: 1,
  offsetX: 0,
  offsetY: 0,
  scaleZ: 1,
  offsetZ: 0,
});

/**
 * Colors crossing the render boundary are **sRGB** 0–1 RGBA floats (i.e. CSS `rgb()` values / 255,
 * alpha not premultiplied), packed 4 per item (`Float32Array` of length `4 * count`), or a single
 * `[r, g, b, a]` tuple applied to all items. Custom 2D shaders write these values straight to the
 * sRGB output so chart colors match CSS exactly. Parsing CSS color strings is the job of the
 * core/defaults layer, not the renderer.
 */
export type RGBA = readonly [number, number, number, number];
export type ColorInput = RGBA | Float32Array;

/** A per-item numeric attribute: one value for all items, or one value per item. */
export type ScalarInput = number | Float32Array;

export type ResourceKind = 'texture' | 'geometry' | 'material';

export interface ResourceStat {
  key: string;
  kind: ResourceKind;
  refs: number;
}

/**
 * Reference-counted registry for GPU resources shared across primitives and charts
 * (unit quads, colorscale LUT textures, glyph atlases, material variants).
 */
export interface ResourceManager {
  /** Get the resource for `key`, creating it with `create` on first use. Increments the refcount. */
  acquire<T extends Texture | BufferGeometry | Material>(key: string, create: () => T): T;
  /** Decrement the refcount for `key`; the resource is disposed when it reaches zero. */
  release(key: string): void;
  /** Live resources, for debug panels and leak tests. */
  stats(): ResourceStat[];
  /** Dispose everything regardless of refcount (used on chart destroy / context loss). */
  disposeAll(): void;
}

/** Context handed to every primitive at construction. */
export interface PrimitiveContext {
  /** Shared, ref-counted GPU resources. */
  readonly resources: ResourceManager;
  /** Mark the owning chart dirty so a frame renders on the next animation frame (ADR-007). */
  invalidate(): void;
}

/** Viewport information a primitive needs for screen-space sizing. */
export interface ViewportSize {
  /** Viewport width in CSS pixels. */
  width: number;
  /** Viewport height in CSS pixels. */
  height: number;
  /** Device pixel ratio in effect for the canvas. */
  pixelRatio: number;
}

/**
 * A GPU drawing building block. Implementations must:
 * - render all items with a constant number of draw calls (independent of item count),
 * - upload only the buffers affected by an `update` when possible (plan §E16.3),
 * - release every acquired resource in `dispose`.
 */
export interface Primitive<TData> {
  /** Root object to add to a viewport's scene. */
  readonly object: Object3D;
  /** Replace or patch the primitive's data. Omitted fields keep their previous values. */
  update(data: Partial<TData>): void;
  /** Set the data → world transform (cheap: uniforms only, no buffer uploads). */
  setTransform(transform: DataTransform): void;
  /** Update viewport-dependent uniforms (resolution, pixel ratio). */
  setViewport(size: ViewportSize): void;
  /** Release GPU resources. The primitive must not be used afterwards. */
  dispose(): void;
}
