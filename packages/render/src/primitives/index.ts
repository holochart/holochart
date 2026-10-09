// Barrel for line, fill, rect, arc, and text primitives (owned by the primitives workstream).
export * from './common.ts';
export * from './common.glsl.ts';
export * from './line.ts';
export * from './line-buffers.ts';
export * from './line-dash.ts';
export * from './line-join.ts';
export * from './line.glsl.ts';
export * from './fill.ts';
export * from './fill-loader.ts';
export * from './pattern.ts';
export * from './rect.ts';
export * from './heatmap.ts';
export * from './raster.ts';
export * from './arc.ts';
export * from './text.ts';
export * from './text-metrics.ts';
export * from './text-fonts.ts';
export * from './text-style.ts';
// Annotation arrows and rotated text boxes (E5.4), container px.
export * from './arrow-geometry.ts';
// 3D lines, sprites and spheres (E14.2): the loader, and only the TYPES of the lazily loaded chunk.
export * from './lines-markers-3d-loader.ts';
export type { Line3D, Line3DData, Line3DOptions } from './line3d.ts';
export type { Markers3D, Markers3DOptions } from './markers3d.ts';
export type {
  SphereData,
  SphereLighting,
  SphereSet,
  SphereSetOptions,
  SphereSizing,
} from './spheres.ts';
export type { Blend3D } from './blend3d.ts';
export type { DepthCoefficients } from './depth-sort.ts';
// 3D meshes, lighting, materials and transparency (E2.11, E8.7, E2.14): the loader, and only the
// TYPES of the lazily loaded chunk (`mesh-lazy.ts`).
export * from './mesh-loader.ts';
export type { MeshData, MeshInput, MeshPrimitive, MeshShaderHooks } from './mesh.ts';
export type { MeshColorSource, MeshIndexArray, MeshLayout } from './mesh-geometry.ts';
export type { MeshMaterialSpec, MeshMaterialType } from './mesh-material.ts';
export type {
  DirectionalLightSpec,
  LightRig,
  LightSpace,
  LightingSpec,
  MeshLighting,
  ViewLights,
} from './lighting.ts';
// Extrusion and the 2.5D view (E8.9): the loader and the bar hook, and only the TYPES of the
// lazily loaded chunk (`extrusion-lazy.ts`).
export * from './extrusion-loader.ts';
export type {
  ExtrusionData,
  ExtrusionHit,
  ExtrusionHost,
  ExtrusionPrimitive,
  LiftedPrimitive,
} from './extrusion.ts';
export type { Outline, PrismBuffers } from './extrusion-geometry.ts';
export type { DomainCamera, DomainHost, DomainShape, DomainView } from './extrusion-domain.ts';
export type { View3DProjector } from './view3d.ts';
export type { View3DAngles, View3DCamera } from './view3d-camera.ts';
// The lazily loaded chunks as type-only namespaces, so that the types of the loaded modules
// (`MeshModule` is `typeof MeshLazy`, …) have names. No code: the chunks stay lazy.
export type * as MeshLazy from './mesh-lazy.ts';
export type * as LinesMarkers3DLazy from './lines-markers-3d.ts';
export type * as ExtrusionLazy from './extrusion-lazy.ts';
export type * as PatternCode from './pattern-code.ts';
