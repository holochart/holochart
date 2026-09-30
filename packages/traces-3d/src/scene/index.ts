/**
 * # The 3D scene subplot (plan E14.1a–c, M6 wave 0)
 *
 * A scene (`layout.scene`, `scene2`, …) is a non-cartesian subplot with its own viewport,
 * perspective or orthographic camera and depth buffer, drawn after the cartesian subplots and
 * before the overlay (hover labels, legend and modebar keep working over it). It lives here, like
 * polar in `traces-sci`: `basic` only carries the runtime hook that gives it a viewport.
 *
 * ## Pieces
 *
 * | Module              | What                                                                  |
 * | ------------------- | --------------------------------------------------------------------- |
 * | `layout-attributes` | `scene*` attributes (`sceneAttributes`), the trace attribute `scene`  |
 * | `layout-defaults`   | scene defaults: domains, camera, aspect, 3D axes, `_sceneIds`         |
 * | `axes`              | scales, autorange (1/32 padding), `aspectmode`, linear → world, ticks |
 * | `layout`            | `SceneLayout` per pass; `sceneCrossTraceLayout`, `sceneSubplotDomain` |
 * | `scene`             | `Scene3D`, the live scene: viewport, camera, projections              |
 * | `camera`            | camera math: orbit, turntable, dolly, pan, relayout payloads          |
 * | `controls`          | damped motion from drags, wheel and pinches                           |
 * | `walls` / `labels`  | far walls and label edges per camera; label placement and culling     |
 * | `draw`              | walls, grid / zero / axis lines, tick marks, billboarded labels       |
 * | `component`         | `sceneComponent`: defaults, drawing, controls; `modebar`: 3D buttons  |
 * | `pick` / `hover`     | GPU picking per scene, the hover points of 3D traces (E14.1d)        |
 * | `spikes` / `annotations` | hover spikes to the walls, `scene.annotations[]` (E14.1d)       |
 * | `overlays`          | the component's picking, spikes, annotations and `click`              |
 * | `camera-animation`  | camera tweens (orbit, not a line), auto-rotation steps, `autorotate`  |
 * | `camera-motion`     | `animateCamera` flights, camera transitions, auto-rotation loop       |
 * | `lighting-attributes` | trace `lighting` / `lightposition` / `material`, `scene.lighting`   |
 * | `scene-lighting`    | the scene's light rig (`scene.useLightRig(mesh)`)                     |
 *
 * ## Coordinates
 *
 * - **Linear**: the axis' linear space (core `Scale`): numbers, log10, ms, category indices.
 * - **Scene units (world)**: each axis range maps onto `[-a/2, a/2]`, `a` the resolved aspect
 *   ratio (Plotly's gl-plot3d model), so the camera's `eye` / `center` / `up` are Plotly's
 *   `scene.camera` values as they are (default eye `(1.25, 1.25, 1.25)`, z up). The map is
 *   `Scene3D.transform`, a `DataTransform` with its `z` fields set:
 *   `world = linear · scale + offset` per axis.
 * - **Screen**: container px, top-left origin (`Scene3D.project`); the overlay's world is the same
 *   with y flipped (`overlay.size.height − y`).
 *
 * ## Contract for 3D trace modules (wave 1: `scatter3d`, `surface`, `mesh3d`, `cone`)
 *
 * ```ts
 * const scatter3d: TraceModule<Scatter3dCalc> = {
 *   type: 'scatter3d',
 *   categories: ['gl3d', 'showLegend', 'symbols'],
 *   schema: attr.object({ scene: sceneIdAttribute, ... }),
 *   touchAction: 'none', // one-finger orbit, pinch zoom
 *   subplotDomain: sceneSubplotDomain, // placed by `layout.sceneN.domain`
 *   crossTraceLayout: sceneCrossTraceLayout, // shared: lays out every scene once per pass
 *   calc(trace, ctx) {
 *     const axes = sceneScales(ctx.fullLayout, sceneOf(trace)); // x, y, z core Scales
 *     const x = axes.x.d2lArray(trace.x); // … y, z
 *     return { x, y, z, sceneExtremes: { x: sceneExtent(x), y: sceneExtent(y), z: sceneExtent(z) } };
 *   },
 *   plot: { create(ctx) { … } },
 * };
 * ```
 *
 * - **Calc** extends {@link SceneCalc}: `sceneExtremes` (linear `[min, max]` per axis; the scene
 *   pads their union by 1/32 per side, Plotly's autorange) and `scene`, which
 *   {@link sceneCrossTraceLayout} sets to the pass's {@link SceneLayout} before `plot`. Axis types
 *   and categories come from the scene defaults (`fullLayout.sceneN.xaxis.type`, `_categories`).
 * - **View**: `const scene = acquireScene(ctx, sceneOf(ctx.trace), ctx.calc.scene)` gives the
 *   {@link Scene3D} (it asks the runtime for the scene's viewport with `ctx.subplotViewport`).
 *   Add primitives with `ctx.add(primitive, scene.viewport)` and give them
 *   `primitive.setTransform(scene.transform)`: positions stay in linear coordinates (primitives
 *   subtract their own float64 origin, so dates keep precision). Update the transform on every
 *   `plan.plot` / `plan.transform` (ranges and aspect change in layout passes, which also re-run
 *   `crossTraceLayout`, so members get `plot`). A camera move needs nothing: primitives read
 *   the viewport camera's matrices when drawn; `scene.onCameraChange(fn)` is there for views that
 *   depend on the view (depth sorting, level of detail).
 * - **Depth**: the viewport clears depth first. Opaque primitives write and test depth; the axes'
 *   walls and lines draw first in the transparent pass (render orders −3, −2) without writing
 *   depth, so traces use render orders ≥ 0.
 * - **Clipping**: data outside the axis ranges is not clipped yet (Plotly clips to the box):
 *   planned with the 3D primitives, from `scene.layout.aspect` (the box is `[-a/2, a/2]`).
 * - **Hover and picking (E14.1d)**: 3D traces are hovered like domain traces (the runtime calls
 *   `hoverPoints` on every hover with the pointer in container px, `query.cx` / `query.cy`),
 *   through GPU picking (`pick.ts`, `hover.ts`):
 *
 *   ```ts
 *   // view: make what is drawn pickable as this trace (again on every update: the index may move)
 *   registerScenePickable(scene, markers, ctx.index); // Markers3D, Line3D, SphereSet, …
 *   registerScenePickable(scene, mesh.object, ctx.index, { element: 'vertex' }); // any Object3D
 *   invalidateScenePicks(scene); // after updates that change what is drawn where
 *   unregisterScenePickable(scene, markers); // before disposing it
 *   // module:
 *   hoverPoints(calc, trace, query, ctx) {
 *     const pick = scenePicks(trace, query, ctx); // this trace's hits under the pointer
 *     if (!pick) return [];
 *     const hit = pick.hits[0]!; // nearest first: `pointIndex` (per `element`), `object`
 *     const i = hit.pointIndex; // → data index, a grid cell, …
 *     return [sceneHoverPoint(pick, trace, { pointIndex: i, x: calc.x[i], y: …, z: … })];
 *   },
 *   ```
 *
 *   One GPU pick per pointer position serves every trace of a scene: it resolves asynchronously
 *   and hover runs again (`chart.refreshHover()`) with its hits; until then hover keeps the
 *   previous hits near that position. `sceneHoverPoint` anchors the label at the projected point
 *   (linear `x`, `y`, `z`), formats the values per scene axis (`hoverformat`, trace
 *   `xhoverformat` / `yhoverformat` / `zhoverformat`) into `x: …<br>y: …<br>z: …` (per
 *   `hoverinfo`; `extraText` adds lines) and `%{x}` / `%{y}` / `%{z}` labels, reports `x`, `y`,
 *   `z` (the data, or `values`) in events, and records the position for the spikes, which the
 *   scene component draws for the winning point (`spikes.ts`: to the walls, `showspikes`,
 *   `spikesides`, `spikecolor`, `spikethickness`). A camera move hides the label; it comes back
 *   at the new place when the camera rests. `scene.hovermode: false` turns hover off. A click in a
 *   scene emits `click` with the hovered point (the press itself starts a camera gesture).
 *   `scene.annotations` are drawn by the component (`annotations.ts`).
 * - **Camera**: `scene.camera` (live, scene units) and `scene.setCamera(camera)` for animations
 *   (E7.5); commit with `chart.relayout({ 'scene.camera': sceneCameraPayload(camera, projection) })`.
 *   The component runs `chart.animateCamera` flights, `scene.autorotate` and camera transitions
 *   (`camera-motion.ts`): the live camera then moves without pipeline runs, so views that depend on
 *   the view use `scene.onCameraChange`.
 * - **Materials and lighting (E8.7)**: meshes take Plotly's `lighting` / `lightposition` and the
 *   Holochart `material` from `lighting-attributes.ts`, and the scene's lights from its rig:
 *
 *   ```ts
 *   schema: attr.object({
 *     ...sceneLightingAttributes('mesh3d'), // Plotly's defaults of that trace type
 *     ...sceneMaterialAttributes, // `material: { type, roughness, …, castshadow, receiveshadow }`
 *   }),
 *   supplyDefaults(traceIn, traceOut, ctx) { …; supplySceneLightingDefaults(ctx); },
 *   // view: the mesh primitive's `lighting`, `lightposition`, `material`, `castShadow`, `receiveShadow`
 *   const mesh = createLazyMeshPrimitive(ctx.primitives, { positions, …, ...sceneMeshLighting(ctx.trace, () => ctx.invalidate()) });
 *   const stop = scene.useLightRig(mesh); // call `stop()` when the mesh is disposed
 *   ```
 *
 *   `sceneLightingAttributes(type)` takes plotly.js' defaults per trace type
 *   (`SCENE_LIGHTING_DEFAULTS`: `surface` has no normal epsilons and lights from `(10, 1e4, 0)`;
 *   `isosurface` / `volume` default `facenormalsepsilon` to 0) or custom defaults. The scene's
 *   `lighting` (a render `LightRig`) lights three.js material types always, and Plotly's model only
 *   when set (else each mesh keeps its own `lightposition` light, as in Plotly).
 */
export { sceneComponent } from './component.ts';
export { sceneAttributes, sceneAxisAttributes, sceneIdAttribute } from './layout-attributes.ts';
export { isSceneTrace, sceneIds, sceneOf } from './layout-defaults.ts';
export {
  buildSceneLayout,
  sceneCrossTraceLayout,
  sceneSubplotDomain,
  type SceneAxis,
  type SceneCalc,
  type SceneCrossTrace,
  type SceneLayout,
} from './layout.ts';
export { sceneExtent, sceneScales, type SceneExtremes } from './axes.ts';
export { sceneCameraPayload, type SceneCamera, type SceneProjection } from './camera.ts';
export { acquireScene, Scene3D, sceneFor, type SceneContext, type ScreenPoint } from './scene.ts';
export {
  autorotateCamera,
  cameraTween,
  interpolateCamera,
  resolveCameraTarget,
  sceneAutorotateAttributes,
  type CameraTargetInput,
  type CameraVectorInput,
} from './camera-animation.ts';
export {
  SCENE_LIGHTING_DEFAULTS,
  SCENE_MATERIAL_TYPES,
  sceneLightingAttributes,
  sceneLightingSpec,
  sceneLightRigAttributes,
  sceneMaterialAttributes,
  sceneMaterialSpec,
  sceneMeshLighting,
  supplySceneLightingDefaults,
  type SceneLightingDefaults,
  type SceneLightingTrace,
} from './lighting-attributes.ts';
export { SceneLighting, type LightRigUser } from './scene-lighting.ts';
export {
  sceneAxisHoverText,
  sceneHoverPoint,
  sceneHoverText,
  scenePicks,
  type SceneHoverSpec,
  type ScenePicks,
} from './hover.ts';
export {
  invalidateScenePicks,
  registerScenePickable,
  SCENE_PICK_RADIUS,
  unregisterScenePickable,
  type ScenePickableOptions,
} from './pick.ts';
