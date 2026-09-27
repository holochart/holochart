---
'@mk7s/holochart-traces-sci': minor
'@mk7s/holochart-traces-stats': minor
'@mk7s/holochart-render': minor
'@mk7s/holochart-core': minor
'@mk7s/holochart': minor
---

`contour` trace (E11.2): contour plots of a `z` grid (2D or column data, `x` / `y` or `x0` / `dx`, `transpose`, uneven grids), with every `contours.coloring` (filled bands, a smooth GPU heatmap, colored or plain lines), automatic or explicit levels, `line.smoothing`, dashes, a banded colorbar, nearest-grid-point hover and level labels along the lines. Labels are now placed by a port of Plotly's label optimizer (horizontal where possible, away from edges and other labels) and every line is cut exactly under the label boxes, for `histogram2dcontour` too. Constraint contours (`contours.type: 'constraint'`, every `operation`, `value`, `fillcolor`) shade where the values satisfy an inequality or interval, for `contour` and `histogram2dcontour`. Gaps are filled for contouring, and with `connectgaps: false` the drawing is clipped to the data like Plotly's (a new `'intersect'` fill rule clips fills on the GPU side). The contouring, colors and renderer shared by both contour traces are exported from `@mk7s/holochart-traces-stats`. The default template gives `contour` the sequential ramp.
