---
'@mk7s/holochart-render': minor
---

3D line and marker primitives for `scatter3d` (plan E14.2, render part), loaded on first use with `loadLinesMarkers3D()` (a lazy chunk: 2D charts and the `basic` / `core + scatter` bundles don't load it). `Line3D`: screen-space thick polylines in perspective and orthographic 3D cameras with the 2D line's joins, caps, dashes (px at every depth, phase from projected lengths), per-vertex colors and NaN gaps, clipped against the near plane in clip space, depth-tested, and GPU-pickable per vertex. `Markers3D`: the SDF sprite markers (every scatter3d symbol) with 3D blending (opaque markers write depth with alpha to coverage) and optional back-to-front sorting of translucent markers that keeps pick ids on data indices. `SphereSet`: instanced lit sphere impostors (`marker.render: 'sphere'`) with px or world sizing, colorscales, exact depth and picking.
