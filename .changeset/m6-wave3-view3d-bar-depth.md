---
'@mk7s/holochart': minor
'@mk7s/holochart-core': minor
'@mk7s/holochart-render': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-components': minor
'@mk7s/holochart-traces-basic': minor
---

2.5D view and extruded bars (E8.9, E9.10), in the full bundle like 3D. `layout.view3d` (`enabled`, `tilt`, `rotation`, `perspective`, `interactive`) shows every cartesian subplot in perspective, its plot area a tilted plane: axes, grid lines, tick labels and titles are drawn in the same 3D space, flat traces are clipped to the tilted plot area (stencil), and hover, click, zoom, pan and box / lasso selection map the pointer onto the plane — or onto the extruded bar under it — so values stay exact; hover labels and drag outlines are drawn in perspective. `tilt: 0, rotation: 0` is exactly the flat view, so `animate` / `react` transitions move smoothly from and to it when `enabled` changes; with `dragmode: 'turntable'` or `'orbit'`, dragging the plot turns the view and commits one `relayout`. Bars take `depth` (px, a percentage of the bar width, or one number per bar), `bevel.{size, segments}` and `material` (Plotly's lighting model, `flat` or a three.js material type): lit prisms, one draw call per trace, in every bar mode, horizontal, with negative values and `base`, labels and error bars on the front faces; in the flat view the front faces keep their exact colors and bevels shade the edges. The code (camera, clipping, prisms) is render's lazily loaded 2.5D chunk, in the 3D add-on for script tags (without it, charts stay flat with one warning). Core's `extrusionAttributes`, `litMaterialAttributes` and `withExtrusion` declare the attributes once for later traces; render exports `extrudeRects`, the extrusion loader and a viewport `projector` hook; traces-basic `setBarExtruder`; components `lazyRenderer`.
