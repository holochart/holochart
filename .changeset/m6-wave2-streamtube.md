---
'@mk7s/holochart-traces-3d': minor
'@mk7s/holochart-core': minor
'@mk7s/holochart': minor
---

`streamtube` 3D trace (M6 wave 2): stream tubes through a vector field given on a rectilinear grid (`x`, `y`, `z`, `u`, `v`, `w`, flattened in any of Plotly's six fill orders, ascending or descending, non-uniform spacing), integrated with RK4 through the trilinearly interpolated field from `starts.{x, y, z}` (default: Plotly's x–z plane at the lowest y), sampled and capped per `maxdisplayed`, with the radius following the divergence (gl-streamtube3d's sizing, `sizeref`) and the color the vector norm (colorscale, `cmin` / `cmax`, colorbar, `coloraxis`). All tubes are one lit mesh (Plotly's `lighting` / `lightposition`, the `material` extension); hover shows the nearest tube sample's position, vector, norm and divergence (`u`, `v`, `w`, `norm`, `divergence` flags; Plotly's `tubex` … `tubew`, `norm`, `divergence` template and event fields). The integration (`detectStreamGrid`, `sampleStreamGrid`, `integrateStreams`) is pure and exported. The default `holochart` template gives it the slim colorbar.
