/**
 * Shared picking types (ADR-010). Kept free of runtime imports so primitives (e.g. markers) can
 * implement the pick contracts without depending on the picker implementation.
 */
import type { Mesh, Object3D, ShaderMaterial } from 'three';
import type { Viewport } from '../core/viewport.ts';

/**
 * What a hit refers to:
 * - `point`: a data point (2D point source or instanced marker),
 * - `instance`: an instance of a user `InstancedMesh`,
 * - `vertex`: a mesh vertex (the provoking vertex of the triangle under the cursor),
 * - `triangle`: a triangle of a non-indexed mesh,
 * - `object`: the object as a whole (`pointIndex` is -1).
 */
export type PickElementKind = 'point' | 'instance' | 'vertex' | 'triangle' | 'object';

/** A single picking hit. */
export interface PickResult {
  /** Index of the trace the hit belongs to (as given at registration). */
  traceIndex: number;
  /** Index of the point / instance / vertex / triangle within the trace; -1 for object-level. */
  pointIndex: number;
  /**
   * Distance from the pick position in CSS px. 2D: to the point's centre. 3D (GPU): to the
   * nearest rendered pixel of the hit (0 when it is under the cursor).
   */
  distance: number;
  /** What `pointIndex` counts. */
  kind: PickElementKind;
  /** 3D only: the three.js mesh that was hit (for a marker set, its instanced mesh). */
  object?: Object3D;
  /** The viewport the pick was routed to (set by {@link Picker}). */
  viewport?: Viewport;
}

/**
 * Hover/pick modes:
 * - `closest`: the single nearest hit within the radius,
 * - `all`: every hit within the radius, nearest first,
 * - `x` / `y` (2D only): per trace, the point nearest in x (or y) within the radius, sorted by that
 *   1D distance (Plotly's `hovermode: 'x'`). 3D views treat them as `closest`: a GPU window
 *   cannot express "everything along a screen axis" (ADR-010).
 */
export type PickMode = 'closest' | 'all' | 'x' | 'y';

/** Options for a pick query. */
export interface PickOptions {
  /** Search radius in CSS px. Default {@link DEFAULT_PICK_RADIUS}. */
  radius?: number;
  /** Default `'closest'`. */
  mode?: PickMode;
}

/** Default search radius (CSS px), matching Plotly's default `hoverdistance`. */
export const DEFAULT_PICK_RADIUS = 20;

/** Per-pick state handed to pick materials before the pick pass renders. */
export interface PickRenderState {
  /** First pick id of this draw's range; the shader writes `base + element`. */
  base: number;
  /**
   * The pick window's size in the view's CSS px. Screen-space sized primitives (markers) must use
   * it as their resolution so their pixel sizes match the visible frame.
   */
  windowWidth: number;
  windowHeight: number;
  pixelRatio: number;
}

/**
 * A pick-mode material bound to one drawable. It writes encoded pick ids (see `PICK_ENCODE_GLSL`)
 * and mirrors the drawable's depth state so occlusion matches the visible frame.
 */
export interface PickMaterialHandle {
  readonly material: ShaderMaterial;
  /** Sync uniforms/defines/state from the source before a pick pass. */
  prepare(state: Readonly<PickRenderState>): void;
  dispose(): void;
}

/**
 * A primitive with its own pick shader path (e.g. `MarkerSet`): `object` is drawn with the
 * material from {@link createPickMaterial}, and gets `pickCount` ids (one per instance).
 */
export interface PickablePrimitive {
  readonly object: Mesh;
  /** Number of ids the pick material may write (e.g. drawn instances). */
  readonly pickCount: number;
  /** What a pick id offset counts (e.g. `'point'` for markers). */
  readonly pickKind: PickElementKind;
  createPickMaterial(): PickMaterialHandle;
}

/**
 * How generic meshes are resolved (WebGL2 has no `gl_PrimitiveID`, so triangles are derived from
 * `gl_VertexID`):
 * - `object`: one id per mesh (default for plain meshes),
 * - `instance`: `gl_InstanceID` (default for `InstancedMesh`),
 * - `vertex`: the provoking vertex (the LAST vertex of the rasterized triangle in WebGL). Its index
 *   is the geometry vertex index for both indexed and non-indexed geometry; for a grid surface it
 *   identifies one corner of the cell under the cursor,
 * - `triangle`: `floor(gl_VertexID / 3)`: exact for non-indexed geometry. Indexed geometry falls
 *   back to `vertex` (an indexed draw's `gl_VertexID` is the index value, not the draw position).
 */
export type MeshPickElement = 'object' | 'instance' | 'vertex' | 'triangle';
