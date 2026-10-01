---
'@mk7s/holochart': minor
'@mk7s/holochart-render': minor
'@mk7s/holochart-traces-finance': minor
'@mk7s/holochart-traces-sci': minor
---

`depth` on funnel, waterfall, heatmap and filled scatter traces (E8.9), in the full bundle like the rest of 2.5D. Funnels and waterfalls extrude like bars (`depth` in px, a percentage of the bar width or one number per item, `bevel`, `material`), with their connectors — a funnel's regions and outlines, a waterfall's lines — on the plane of the front faces and the labels on the front faces. Heatmaps stand their cells up as columns as tall as their values (`depth`: the height at `zmax`, or a percentage of the mean cell width; linear from 0, or from `zmin` with negative values), colored like the cells, spaced by `xgap` / `ygap`, over the flat heatmap as their floor: one merged mesh, about 0.2 s for 200 × 200 cells, grids above 100,000 cells stay flat with a warning. Filled scatter traces (`fill`) become slabs: the fill's exact triangulation (holes, self-intersecting `toself` shapes by the nonzero rule) as the front face, walls on its outline only, the line, markers and labels on the front; stacked areas share the depth range and form one layered slab. Hover and click are exact in the tilted view (ray casts against the prisms, columns and slabs). Render adds `extrudeHeatmap`, `extrudeFills`, an `ExtrusionHost.lift` for more primitives to lift, custom `prisms` / `hit` on the extrusion primitive, and `FillPrimitive.current`; the full bundle registers `extrudedScatter`.
