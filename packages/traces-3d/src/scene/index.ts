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
 * - **Hover and picking (E14.1d, wave 1)**: 3D traces are hovered like domain traces: the runtime
 *   calls `hoverPoints` on every hover with the pointer in container px (`query.cx`, `query.cy`).
 *   `sceneFor(ctx.fullLayout, trace)` gives the live scene of that pass; `scene.toWorld` then
 *   `scene.project` put a data point on screen (CPU picking), and `scene.viewport` (camera,
 *   rect) is what GPU picking renders. Hover points anchor in overlay px (y up: `height − y`).
 *   `scene.hovermode` and the axes' `showspikes` / `spikesides` / `spikecolor` /
 *   `spikethickness` are defaulted for it.
 * - **Camera**: `scene.camera` (live, scene units) and `scene.setCamera(camera)` for animations
 *   (E7.5); commit with `chart.relayout({ 'scene.camera': sceneCameraPayload(camera, projection) })`.
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
  type SceneLayout,
} from './layout.ts';
export { sceneExtent, sceneScales, type SceneExtremes } from './axes.ts';
export { sceneCameraPayload, type SceneCamera, type SceneProjection } from './camera.ts';
export { acquireScene, Scene3D, sceneFor, type SceneContext, type ScreenPoint } from './scene.ts';
