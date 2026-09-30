---
'@mk7s/holochart-traces-3d': minor
'@mk7s/holochart-core': minor
'@mk7s/holochart': minor
---

`mesh3d` and `cone` 3D traces (M6 wave 1). `mesh3d` draws triangle meshes from explicit triangles (`i`, `j`, `k`) or derives them from the vertices like Plotly (`alphahull: -1` a Delaunay triangulation along `delaunayaxis`, `0` the convex hull, `> 0` an alpha shape; computed without dependencies), colored by `intensity` through a colorscale (`intensitymode: 'vertex' | 'cell'`, colorbar, `coloraxis`), per vertex (`vertexcolor`), per face (`facecolor`) or in one `color`, with `flatshading`, Plotly's `lighting` / `lightposition`, the `material` extension, hover (`x`, `y`, `z`, `text`, `%{intensity}`) and the hover contour (`contour.show`: the level set through the hovered point). `cone` draws a vector field (`x`, `y`, `z`, `u`, `v`, `w`) as lit cones in one instanced draw call, sized per Plotly's `sizemode` (`scaled`, `absolute`, `raw`) and `sizeref`, placed per `anchor` (`tip`, `tail`, `cm`, `center`), colored by the vector norms (colorscale, `cmin` / `cmax`, colorbar), with hover showing the vector and its norm (`u`, `v`, `w`, `norm` flags and template fields). The default `holochart` template gives both slim colorbars.
