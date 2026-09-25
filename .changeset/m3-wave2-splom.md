---
'@mk7s/holochart-traces-stats': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-render': minor
'@mk7s/holochart-core': minor
'@mk7s/holochart': minor
---

New `splom` trace (scatter plot matrix, Plotly semantics): `dimensions` with `label`, `values`, `visible` and `axis.{type, matches}`, `diagonal.visible`, `showupperhalf` / `showlowerhalf`, `xaxes` / `yaxes`, scatter markers with colorscale and colorbar, and `selectedpoints`. Each dimension gets an axis pair laid out as a grid, and each cell is one GPU draw over shared per-dimension buffers (new `MarkerMatrix` render primitive). Hover works per cell and names both dimensions. A box or lasso selection in any cell highlights the same samples in every cell. The runtime supports traces that span several subplots (`TraceModule.cells` / `axisData`, `ctx.cells`, `TraceExtremes.byAxis`, `CalcContext.axes`), and core has a splom axis stash that defaults the axes, the grid and `matches`.
