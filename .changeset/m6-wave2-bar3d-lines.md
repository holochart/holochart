---
'@mk7s/holochart-traces-3d': minor
'@mk7s/holochart-render': patch
'@mk7s/holochart-core': minor
'@mk7s/holochart': minor
---

`bar3d` 3D trace and tube / ribbon lines (M6 wave 2, Holochart extensions). `bar3d` draws true 3D bars on an x/y grid: positions `x`, `y` (numbers, dates or categories), heights `z` from `base`, footprints `width` × `depth` (default 0.8 of the smallest position spacing), stacked across traces with `stackgroup` (Plotly's `barmode: 'stack'`, per trace), colored per bar or by height through `marker.colorscale` (colorbar, `coloraxis`), with box edges (`marker.line`, drawn in the faces at any depth), Plotly's `lighting` / `lightposition` or a `material`, translucency sorted back to front, and hover per bar (`x`, `y`, `z`, `base`; `%{base}` / `%{top}` in templates and events) — all bars of a trace in one instanced draw call. `scatter3d` lines take `line.render: 'tube'` (a lit tube of `line.radius`, a fraction of the axis box, with rotation-minimizing frames) or `'ribbon'` (a lit strip swept along `line.ribbon.axis` by `line.ribbon.width`, for waterfall plots), with `line.lighting`, `line.lightposition` and `line.material`. The default `holochart` template gives 3D bars thin background-colored edges. Fixed: opaque 3D lines drew stray dashed "arrowhead" fragments where they lay on or met other geometry at grazing angles (their depth tilted through the segment); the 3D line quad now has exact depth along each segment.
