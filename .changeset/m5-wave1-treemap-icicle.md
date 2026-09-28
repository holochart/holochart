---
'@mk7s/holochart-traces-hier': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart': minor
---

The `treemap` (E13.3) and `icicle` (E13.4) traces on the hierarchy engine.

- `treemap`: nested tiles filling `domain`, laid out by d3-hierarchy's tilings (ported, no dependency) — `tiling.packing` `squarify` (with `squarifyratio`, Plotly's default 1), `binary`, `dice`, `slice`, `slice-dice`, `dice-slice` — with `tiling.flip` and `tiling.pad`, branch headers in `marker.pad` (defaults from the label size), `marker.depthfade` (`true`, `false`, `reversed`; Plotly's faded colors), `marker.cornerradius`, `marker.{colors, colorscale, line, pattern}`, `root.color`, and `layout.treemapcolorway` / `extendtreemapcolors`.
- `icicle`: levels side by side (`tiling.orientation` `h` or `v`, `flip`, `pad`), `maxdepth` stretching the levels shown, `leaf.opacity`, and `layout.iciclecolorway` / `extendiciclecolors`.
- Both: the path bar (`pathbar.{visible, side, edgeshape, thickness, textfont}`) of the current root's ancestors outside the domain; labels (`textinfo` / `texttemplate`) in 9 `textposition`s, shrunk to fit — and, unlike Plotly, wrapped at spaces first when a label is short of width; one instanced GPU rect set per trace (fill, centered outline, corner radius and pattern per tile), the path bar in one fill batch, labels in one SDF text batch. Hover labels and events carry Plotly's fields; hovered treemap tiles are outlined as in Plotly.
- Drill-down: a click on a tile (leaves too) zooms into it, a click on the current root or a path bar segment goes up, with Plotly's 750 ms transition (tiles slide in from and out to the edges, path bar segments slide from its end; labels fade in; snapping under reduced motion). The new `treemapclick` / `icicleclick` events (with `nextLevel`) and `click` are emitted first; a listener of either returning `false` cancels. The drill writes `level` with a GUI `restyle`.
- The sunburst shares its drill-down and label font code with them (no change in behavior); the runtime's `ChartEvents` gain `treemapclick` and `icicleclick`.
