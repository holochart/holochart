---
'@mk7s/holochart-traces-hier': minor
'@mk7s/holochart-traces-basic': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart': minor
---

The hierarchy engine (E13.1) and the `sunburst` trace (E13.2) in the new `@mk7s/holochart-traces-hier`.

- Hierarchy engine, shared with the coming `treemap` and `icicle`: rows (`labels`, `parents`, `ids`, `values`) built into a tree as Plotly does — implied roots, a generated root above several roots, repeated leaf ids — with Plotly's warnings for missing parents, ambiguous parent ids, cycles, several implied roots and `branchvalues: 'total'` violations (the trace is then not drawn). `branchvalues` (`remainder`, `total`), `count` (`leaves`, `branches`, both), `sort`, `level` (the current root), `maxdepth`, d3's partition layout, `textinfo` (`label`, `text`, `value`, `current path`, `percent parent`, `percent entry`, `percent root`) and `texttemplate` variables, hover text, Plotly event fields (`currentPath`, `entry`, `root`, `percent*`, `parent`, …), node colors (`<type>colorway` / `extend<type>colors` on the first level, inherited below, shared by id across traces, `root.color`, explicit `marker.colors`, colorscales with colorbars) and an accessible description. `buildHierarchy`, `partition`, `findEntry`, `drillEntry`, `levelWindow`, `nodePath`, `formatNodeValue` and `formatNodePercent` are exported.
- `sunburst`: rings of sectors around the current root, placed by `domain`, `rotation`, `marker.{colors, colorscale, line, pattern}`, `leaf.opacity`, labels fitted inside their sectors like pie's with `insidetextorientation` (`horizontal`, `radial`, `tangential`, `auto`), and `layout.sunburstcolorway` / `extendsunburstcolors`. One instanced GPU arc set (sectors and centered outlines) and one SDF text batch per trace. Hover labels and events carry Plotly's fields.
- Drill-down: a click on a sector zooms into it and a click on the center goes back up, with Plotly's 750 ms transition (sectors move, new ones twist in or grow, others fold away; labels fade in; snapping under reduced motion). The new `sunburstclick` event (Plotly's `plotly_sunburstclick`, with `nextLevel`) and `click` are emitted first; a listener of either returning `false` cancels. The drill writes `level` with a GUI `restyle`, so `uirevision` keeps it.
- `@mk7s/holochart-traces-basic` exports pie's inside-text fitting (`transformInsideText`) and the colorscale helpers (`colorscaleAttributes`, `resolveColorMapping`, `mapColor`, `markerColorbar`) for other trace packages; the runtime's `ChartEvents` gain `sunburstclick` (`HierarchyClickEventData`).
