/**
 * Entry of the lazily loaded 3D line and marker chunk (plan E14.2, the render part of
 * `scatter3d`): the only module `lines-markers-3d-loader.ts` imports, with a dynamic `import()`,
 * so 2D charts (and the `basic` and `core + scatter` bundles) never load 3D line, sprite, sphere or
 * depth-sorting code. Nothing else in the package imports these modules statically (the package
 * exports only their types), which is what lets bundlers split them out.
 *
 * ## For `scatter3d` (wave 1)
 *
 * - `mode: 'lines'` → {@link Line3D} (`LineData` fields: per-vertex `color` — map `line.color`
 *   arrays through the colorscale on the CPU like 2D scatter —, `width`, `dash`, NaN gaps,
 *   `connectGaps`).
 * - `mode: 'markers'`, `marker.render: 'sprite'` (default) → {@link Markers3D} (every
 *   `MarkerData` field; `depthSort` for translucent markers); `'sphere'` → {@link SphereSet}
 *   (`size` in px at the center by default, or world units with `sizing: 'world'`).
 * - `mode: 'text'` → the existing `TextPrimitive` (not in this chunk) with `mode: 'billboard'`,
 *   `sizing: 'screen'`: camera-facing, px-sized labels at `(x, y, z)`, depth-tested (no depth
 *   write); `textposition` maps to `anchorX` / `anchorY` plus a px `offset` (half the marker
 *   size). Placement is recomputed on the CPU per frame (O(labels)), fine for label counts.
 * - Picking: all three are pickable primitives (`GpuPicker.register`); hits report data indices
 *   (lines: the nearer vertex of the segment under the cursor).
 * - Call `update` / `setTransform` as for the 2D primitives; add `object` to the scene's viewport.
 */
export { createLine3D, Line3D } from './line3d.ts';
export { createMarkers3D, Markers3D } from './markers3d.ts';
export { createSpheres, DEFAULT_SPHERE_LIGHTING, SphereSet } from './spheres.ts';
export { depthOrder, viewDepthCoefficients } from './depth-sort.ts';
