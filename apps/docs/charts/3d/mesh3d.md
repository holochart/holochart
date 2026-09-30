---
title: 3D mesh
description: Draw triangle meshes in a 3D scene, from explicit triangles or derived from points (Delaunay, convex hull, alpha shape), colored by intensity, per vertex, per face or in one color.
status: complete
chart: mesh3d
---

# 3D mesh

## Overview

A 3D mesh (trace type `mesh3d`) draws a surface made of triangles in a
[3D scene](/fundamentals/3d-scenes): a CAD part, a scanned object, a terrain, the hull around a
point cloud. You give the vertices (`x`, `y`, `z`) and either the triangles (`i`, `j`, `k`) or let
the trace derive them from the points: a Delaunay triangulation for a single surface layer, the
convex hull, or an alpha shape that follows concave outlines. The mesh can be colored by a value
per vertex or per triangle through a colorscale, by CSS colors per vertex or per triangle, or in
one color, and is lit with Plotly's lighting model.

Pick a different chart when:

- the surface is a function `z = f(x, y)` on a grid: a `surface` trace is simpler and draws the
  grid directly;
- you only want to show the points: use a `scatter3d` trace;
- the data is 2D: a [heatmap](/charts/scientific/heatmap) or a [contour plot](/charts/scientific/contour)
  is easier to read than a surface seen in perspective.

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'mesh3d',
      x: [0, 1, 0, 0],
      y: [0, 0, 1, 0],
      z: [0, 0, 0, 1],
      i: [0, 0, 0, 1],
      j: [1, 1, 2, 2],
      k: [2, 3, 3, 3],
    },
  ],
});
```

Triangle `m` joins the vertices `i[m]`, `j[m]` and `k[m]` (indices into `x`, `y`, `z`): four
triangles make a tetrahedron. The live example draws an icosahedron (12 vertices, 20 triangles)
in the trace's colorway color, smooth shaded:

<Example id="mesh3d/basic" />

## Data format

- `x`, `y`, `z`: the vertices: numbers, dates or categories, as on any scene axis. The three
  arrays must have the same length, else the trace is not drawn (Plotly).
- `i`, `j`, `k`: the triangles, as vertex indices. Give all three or none. Indices are rounded;
  if one is out of range (or the three lengths differ) the whole mesh is not drawn, as in Plotly.
  Triangles with a missing vertex (`null`, `NaN`) are left out.
- Without `i`, `j`, `k`, `alphahull` decides how triangles are derived from the vertices:
  - `-1` (default): a 2D **Delaunay** triangulation of the points projected along
    `delaunayaxis` (`'z'`: of their x–y positions; `'x'`: y–z; `'y'`: z–x). Suits a single
    surface layer seen along that axis, such as a terrain from scattered samples.
  - `0`: the **convex hull** of the points (points inside it are left out).
  - `> 0`: the **alpha shape** with this alpha: the Delaunay tetrahedra of the points whose
    circumradius is below `1 / alphahull`, and the triangles on their boundary. It follows
    concave shapes the convex hull fills in.

  As in Plotly, these work on coordinates scaled to the unit cube per axis (each axis divided by
  the data's span), so `alphahull` doesn't depend on the data's units, and a Delaunay
  triangulation of long, flat data isn't skewed by the axis scales. Coplanar points (for the hull)
  or collinear ones (for Delaunay) give no triangles.

- `intensity`: values mapped through the colorscale, one per vertex (`intensitymode: 'vertex'`,
  default) or one per triangle (`'cell'`).
- `vertexcolor` / `facecolor`: a CSS color per vertex / per triangle.

## Variations

### Delaunay triangulation of scattered points

With neither `i`, `j`, `k` nor `alphahull`, 300 random samples of a terrain become a surface:
the default `alphahull: -1` triangulates their x–y positions. `intensity: z` colors it by height.

<Example id="mesh3d/delaunay" />

### Convex hull

`alphahull: 0` wraps a point cloud in its convex hull. `flatshading` shows the facets and
`opacity` draws it translucent (its triangles are sorted back to front when the view changes).

<Example id="mesh3d/convex-hull" />

### Alpha shape

A positive `alphahull` keeps the concave outline of the points: here 900 points filling a torus,
whose hole the convex hull would close. Larger values carve tighter (and may split the shape or
leave holes where points are sparse); smaller values approach the convex hull.

<Example id="mesh3d/alpha-shape" />

### Intensity per vertex or per triangle

Per-vertex `intensity` is interpolated across each triangle (the colorscale is sampled per
pixel); `intensitymode: 'cell'` gives each triangle one value, and one color. Both meshes here
share a `coloraxis`, and with it one colorbar and one color domain.

<Example id="mesh3d/intensity" />

### Vertex and face colors

`vertexcolor` blends CSS colors across the triangles, `facecolor` paints each triangle.

<Example id="mesh3d/colors" />

### Flat shading

`flatshading: true` lights each triangle with its own normal: the low-poly sphere on the right
shows its facets, the one on the left interpolates normals across them.

<Example id="mesh3d/flatshading" />

### Lighting

`lighting` sets the coefficients of Plotly's lighting model: `ambient` (the share of the color
shown whatever the light), `diffuse`, `specular` (highlights), `roughness` (their spread) and
`fresnel` (brighter at grazing angles). `lightposition` places the light in clip space, so it
moves with the view (default far to the upper right).

<Example id="mesh3d/lighting" />

### Hover contour

`contour.show` draws, while hovering, the contour line through the hovered point: the level set of
`intensity` (of z without intensity) at its value, in `contour.color` and `contour.width`.

<Example id="mesh3d/contour" />

## Styling

- **Color precedence** (Plotly's): `intensity` (through `colorscale`, `cmin` / `cmax` /
  `cmid` / `cauto`, `reversescale`, or a shared `coloraxis`), then `vertexcolor`, then
  `facecolor`, then `color` (default: the trace's colorway color). Only the first one given is
  used. Without an explicit `colorscale`, intensities pick the layout's automatic ramps
  (`autocolorscale`): sequential for non-negative values, diverging across zero.
- **Colorbar.** A mesh with `intensity` shows a colorbar (`showscale`, default on; `colorbar`).
  The default `holochart` look slims it; `plotly-classic` keeps Plotly's.
- **Opacity.** `opacity` (and alpha in the colors or the colorscale) draws the mesh translucent,
  without depth writes and with its triangles sorted back to front whenever the view changes.
- **Shading.** `flatshading`, `lighting.{ambient, diffuse, specular, roughness, fresnel,
vertexnormalsepsilon, facenormalsepsilon}` and `lightposition.{x, y, z}` with Plotly's mesh3d
  defaults (ambient 0.8, diffuse 0.8, specular 0.05, roughness 0.5, fresnel 0.2; the light at
  `(1e5, 1e5, 0)`).
- **Legend.** Meshes are described by their colorbar and have no legend entry unless
  `showlegend: true`, as in Plotly.

## Interactivity

- **Hover.** With per-vertex colors the label shows the hovered triangle's vertex nearest to the
  pointer: `x`, `y`, `z` (formatted like the scene's axes, or by `xhoverformat`,
  `yhoverformat`, `zhoverformat`) and its `text` / `hovertext`. With per-triangle colors
  (`intensitymode: 'cell'` or `facecolor`) it shows the triangle's centroid and the triangle's
  text. `hovertemplate` can use `%{x}`, `%{y}`, `%{z}`, `%{text}` and `%{intensity}`; `hoverinfo`
  takes `x`, `y`, `z`, `text` and `name`.
- **Events.** `hover` and `click` points carry `x`, `y`, `z`, `intensity` and `pointNumber` (the
  vertex, or the triangle with per-triangle colors):

  ```ts
  import { createChart } from '@mk7s/holochart';

  const chart = createChart(document.getElementById('chart')!, {
    data: [{ type: 'mesh3d', x: [0, 1, 0], y: [0, 0, 1], z: [0, 0, 1], i: [0], j: [1], k: [2] }],
  });
  chart.on('click', (e) => console.log(e.points[0]?.pointNumber));
  ```

- **Camera.** Orbit, zoom and pan are the scene's (see [3D scenes](/fundamentals/3d-scenes)).

## 3D-native options

- `material` (Holochart extension) swaps Plotly's lighting model for a three.js material:
  `material.type` `'flat'` (unlit), `'lambert'`, `'phong'`, `'standard'`, `'physical'`,
  `'toon'`, `'matcap'`, …, lit by the scene's lights (`scene.lighting`), with shadows. See
  [materials and lighting](/customization/materials-lighting).
- A scene's `lighting` rig, when set, lights every mesh of the scene; each mesh's `lighting`
  coefficients then scale its lights.

## Performance notes

- The mesh is one draw call. Positions are stored relative to the mesh's center in 32-bit floats
  (with a 64-bit origin), so large coordinates (dates, geographic units) keep their precision.
- Per-triangle values (`intensitymode: 'cell'`, `facecolor`) and `flatshading` store three
  vertices per triangle instead of sharing them: about three times the memory of a smooth mesh.
- Derived triangles are computed once per data change on the CPU. On a laptop, a Delaunay
  triangulation of 10,000 points takes about 50 ms and their convex hull under 10 ms; an alpha
  shape, which needs the 3D Delaunay tetrahedralization, about half a second. Give `i`, `j`, `k`
  for large meshes.
- Translucent meshes re-sort their triangles whenever the camera moves (a linear-time sort, up to
  500,000 triangles).
- The mesh code loads the first time a scene draws a mesh, so 2D charts never pay for it.

## Accessibility notes

- **Screen readers:** the chart is a `<canvas>`; the hidden description (see the
  [accessibility guide](/guides/accessibility)) names the trace.
- **Keyboard:** there is no keyboard navigation of 3D traces yet.
- **Color:** intensity colors rely on the colorscale: prefer ramps monotonic in lightness (the
  default ones are), and add a titled colorbar.

## Attribute reference

See the [mesh3d attribute reference](/reference/mesh3d) for every attribute, its type, and its
default. Shared color axes are under [`coloraxis`](/reference/layout#coloraxis) in the layout
reference.

## Related charts

- [Cone](/charts/3d/cone): a 3D vector field drawn as cones, in the same scenes and lighting
- [3D scenes](/fundamentals/3d-scenes): cameras, axes and controls of every 3D trace
- [Contour plot](/charts/scientific/contour): level lines of a grid in 2D

## Plotly migration notes

- Attribute names and defaults match Plotly's `mesh3d`: `x`, `y`, `z`, `i`, `j`, `k`,
  `alphahull`, `delaunayaxis`, `intensity`, `intensitymode`, `vertexcolor`, `facecolor`, `color`,
  the colorscale attributes, `opacity`, `flatshading`, `contour`, `lighting`, `lightposition`,
  `text`, `hovertext`, `hovertemplate`, `hoverinfo` and the hover formats.
- Not supported yet: `xcalendar` / `ycalendar` / `zcalendar`, `hovertemplatefallback`, and the
  mesh file loaders (STL, OBJ, PLY, glTF).
- Differences:
  - Triangles derived with `alphahull` scale each axis by the trace's own data span; Plotly uses
    the span of every trace in the scene, which differs only with several traces in one scene.
  - With per-triangle colors, hover shows the triangle's centroid in data coordinates (Plotly
    shows it in its internal scaled units).
  - `%{intensity}` is available in `hovertemplate` (Plotly doesn't expose it), and
    `contour.width` is honored (Plotly always draws 1 px). The hover contour of a mesh with
    per-cell intensity follows z (Plotly contours the cell values as if they were per vertex).
