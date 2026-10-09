# ADR-028: The 3D globe is the orthographic view, drawn by sphere meshes

- **Status:** Proposed
- **Date:** 2026-10-04
- **Deciders:** GEO8; the owner accepts or rejects
- **Related stories:** backlog GEO8; plan E15.4; follows
  [ADR-025](025-geo-projection-pipeline.md) ("GEO8 decides … whether the 2D orthographic
  projection is drawn by that mesh") and [ADR-026](026-geo-packages-and-bundles.md)

## Context

GEO8 asks for `projection.type: 'globe3d'`: a lit sphere with the base layers and choropleth
regions on it, `scattergeo` lines as arcs above it, regions extruded by a second value, and hover
that does not reach the far side. It is a Holochart extra; Plotly has no such projection.

Two facts shape it.

- **An orthographic map is a sphere seen through an orthographic camera.** `d3`'s orthographic
  projection puts longitude λ and latitude φ, after its rotation, at
  `(k · cos φ sin λ, k · sin φ)`: the x and y of a point on a sphere of radius `k`. A 3D viewport
  with an orthographic camera looking at that sphere draws every surface point at the same pixel.
- **Rotation is what the geo subplot cannot afford** (ADR-025: a 50m world reprojects in 90 ms
  through `d3-geo`). A sphere mesh does not reproject: turning it is one matrix.

The geo package is built on `GeoView`: the view state (rotation, scale), the drag, wheel, pinch
and key maths, the relayout keys, `project` and `invert` for hover anchors, selection, keyboard
stops and `fitbounds`. The 3D scene of `traces-3d` has its own camera model (`eye`, `center`,
`up`), its own relayout key (`scene.camera`) and axes, none of which fit a map.

## Decision

We will draw `'globe3d'` as **the orthographic `GeoView`, in a 3D viewport of the geo package's
own**.

- **One view model.** `'globe3d'` is a clipped projection like `'orthographic'`: its `GeoView` is
  built on `geoOrthographic`, so `projection.rotation.{lon, lat, roll}` and `projection.scale`
  are its state, a drag turns it with the same maths, and an interaction commits the same
  relayout keys. Hover anchors, box and lasso selection, keyboard stops, view keys and
  `fitbounds` go through `GeoView` unchanged.
- **Its own viewport, under the subplot's 2D one.** The subplot asks the runtime for a 3D
  viewport with an orthographic camera whose world units are the subplot's px (x right, y up
  from the clip rect's bottom-left corner, z towards the viewer), so the globe's surface points
  land on the pixels the 2D code computes. It covers the subplot's whole domain, since arcs and
  prisms rise past the disc. The subplot's ordinary 2D viewport lies over it and draws what is
  positioned in px: markers, text and the frame. It does not use `traces-3d`'s scene, and the
  package does not depend on `traces-3d`.
- **The globe is a rigid body.** Geometry on the globe is built once in **globe coordinates**: the
  unit sphere, `x = cos φ sin λ`, `y = sin φ`, `z = cos φ cos λ`. One matrix places it: the
  view's rotation (the same rotation `d3` applies), scaled by the globe's radius in px and moved
  to its centre. A rotation or a zoom changes that matrix and nothing else.
- **Meshes, not a texture.** The base layers and choropleth regions are triangle meshes on the
  sphere: polygons are cut at the antimeridian by `d3`, their edges densified to 2.5°,
  triangulated in longitude and latitude, and subdivided until no edge is longer than 5°, as the
  GEO1 spike measured (241,000 vertices at 50m, built in 0.1–0.2 s, drawn in under 1 ms). Lines
  are 3D polylines just above the surface.
- **Depth.** One opaque sphere, the globe's body, writes depth; it is a little smaller than the
  globe (0.998 of its radius), so that nothing on the surface fights it. Layers on the surface
  (land, lakes, regions) test depth and write none: they are drawn in layer order, front faces
  only, so two of them never fight each other and the far hemisphere, which is back-facing, is
  not drawn. What rises above the surface (prisms) tests and writes depth, so it hides the
  surface behind it; arcs and lines test against all of it.
- **Light.** One light fixed to the camera, from the upper left, with no highlight (ambient
  0.7, diffuse 0.3): the globe is shaded the same at every rotation and scale, and a choropleth's
  colors stay close to its colorscale. The mesh primitive's own default light is a point in clip
  space, which through an orthographic camera lies in the plane of the screen and lights half
  the disc flat.
- **`scattergeo`.** Markers and text stay on the 2D path (projected by `GeoView`, hidden on the
  far side on the CPU), drawn in the 2D viewport above the globe. Lines are arcs along the great
  circle, lifted in the middle in proportion to their angular length; `fill: 'toself'` is a mesh
  on the surface.
- **`choropleth`.** Regions are one mesh with a colour per vertex; a restyle rewrites colours.
  New attributes, `elevation` and `elevationscale`, give each region a height, drawn as a prism
  rising from the sphere. `scattergeo` gets `line.lift` for the height of its arcs. All three are
  Holochart's own and are ignored on a flat map.
- **Hover.** Choropleth regions on a globe are picked on the GPU by id (ADR-010), with the body
  occluding, so a prism is hit where it is drawn and nothing behind the globe is. `scattergeo`
  keeps its CPU hover in px, which already leaves out the far side.
- **Bundle.** What draws a globe is lazy code of `traces-geo` (12 kB), loaded when a figure
  uses `'globe3d'`, and it uses render's lazy mesh and 3D-line chunks and, for picking, a lazy
  picker chunk that render gains for this (`loadPicker`: importing `createPicker` would put the
  pickers in the initial chunk of every map). What a globe needs up front (its viewport, camera
  and matrix, and the loaders) is 4.6 kB of the package's initial code.
- **The fit.** A globe, and the orthographic map, are fitted by the sphere's outline, not by
  Plotly's range box of the hemisphere, which `d3` clips to less than the disc at some rotations
  (at longitude −45, latitude 28 the map came out 1.5 times too large).

## Consequences

### Positive

- Rotating a globe costs a matrix, at any resolution and with any number of regions: the one
  case ADR-025 could not make smooth.
- No second view model: relayout keys, `uirevision`, keyboard, selection and `fitbounds` are the
  ones the 2D maps have, and a figure switches between `'orthographic'` and `'globe3d'` by
  changing one attribute.
- Depth gives what the flat projection cannot: arcs that pass behind the globe, prisms.

### Negative

- **Orthographic only.** There is no perspective, tilt or orbit camera; the globe always faces
  the viewer. `d3`'s `satellite` projection is the perspective twin and could be added the same
  way.
- **Markers are not depth-tested**, so a marker behind a prism is drawn over it, and `scattergeo`
  hover does not know about prisms.
- **Two drawing paths in the geo component and in both traces**, chosen by projection type.
- Mesh memory: about 6 MB at 50m for land and countries; prisms for every 50m country are 18 MB.
- The script-tag build needs the 3D add-on's chunks as well as a geo add-on (ADR-026); neither
  geo script exists yet.
- The lit look is fixed; there are no lighting attributes on `layout.geo` yet.
- At `projection.scale: 1` the globe fills its domain, so an arc or prism rising past the limb
  at the top or bottom is cut there; a figure leaves room with a smaller scale.
- A dashed graticule's dashes slide along their lines while the globe turns (the dash phase is
  recomputed on the CPU, throttled).

### Follow-ups

- The animated transition between a flat projection and the globe (GEO8's stretch goal).
- Whether the 2D `'orthographic'` projection should be drawn this way too (ADR-025's question).
  Measured on an M1 Max at 50m with every layer: the globe turns in 9 ms a frame, the flat map
  in 11 ms with its swap to 110m and 92 ms without. The lit look would have to be switched off
  for it.
- Lighting and material attributes; a perspective camera through `satellite`.
- Depth-tested markers on the globe.

## Alternatives considered

### A scene of `traces-3d` with a sphere in it

Reuses the orbit camera, lighting attributes and GPU picking glue. Rejected: the scene's view is
`scene.camera`, so a globe would have a second set of view attributes, relayout keys and keyboard
maths, `fitbounds` and selection would have to be rebuilt on it, and the geo package would
depend on the 3D package (55 kB over the basic traces).

### One draped texture

Draw the map into a texture and wrap it on a sphere. Rejected: it blurs when zoomed, cannot
extrude or pick regions, and the spike showed meshes are cheap.

### Project in the vertex shader

ADR-025's shader path for the orthographic projection. A sphere mesh with a matrix is the same
thing with depth, lighting and no shader hook.

## References

- `backlog.md`, GEO8; [spike F](../spikes/f-geo-projection.md), "What it means for GEO2, GEO5
  and GEO8"
- [ADR-010](010-cpu-spatial-hover-gpu-picking-3d.md), [ADR-025](025-geo-projection-pipeline.md),
  [ADR-026](026-geo-packages-and-bundles.md)
- `packages/traces-geo/src/geo/view.ts` (the clipped mode), `packages/render/src/primitives/mesh.ts`
