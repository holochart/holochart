---
'@mk7s/holochart-traces-sci': minor
'@mk7s/holochart-traces-stats': minor
'@mk7s/holochart-render': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-core': minor
'@mk7s/holochart-express': minor
'@mk7s/holochart': minor
---

`heatmap` trace (E11.1): a grid of values — a 2D `z`, or 1D `z` with `x` / `y` columns — drawn as one float texture sampled through the colorscale LUT on the GPU (restyling the colorscale or `zmin` / `zmax` / `zmid` is a uniform update), with cell centers or edges from `x` / `y` or `x0` / `dx`, `xtype` / `ytype`, `transpose`, uneven cells, `xgap` / `ygap`, `zsmooth` (`'fast'` and `'best'`, bilinear), `connectgaps` and `hoverongaps`, on linear, log, date and category axes; annotated heatmaps with `texttemplate` / `textfont` (auto-sized, contrasting labels), per-cell hover with 2D `text` / `hovertext` / `customdata` (events report `pointNumber` as `[row, column]`) and a colorbar or shared `coloraxis`. `image` trace (E11.3): RGB, RGBA and HSL pixels (`z` with `colormodel`, per-component `zmin` / `zmax`) or a base64 data-URI picture (`source`), placed by `x0` / `y0` / `dx` / `dy`, pixelated or smoothed (`zsmooth: 'fast'`), with pixel hover and Plotly's axis defaults for images (reversed y, square pixels through `scaleanchor`, `constrain: 'domain'`). New render primitive `RasterPrimitive`; the heatmap primitive draws both faces (descending edges, reversed axes) and accepts a known `zRange`. Express `imshow` builds heatmaps or images from matrices, RGB(A) arrays or `ImageData`, with `aspect`, `origin`, facets and animation over extra dimensions, `binaryString` (PNG data URIs) and `textAuto`. The default template gives `heatmap` the sequential ramp.
