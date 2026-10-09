# ADR-025: Geo projects on the CPU through d3-geo, at 110m while the view rotates

- **Status:** Proposed
- **Date:** 2026-10-04
- **Deciders:** GEO1; the owner accepts or rejects
- **Related stories:** backlog GEO1, GEO2, GEO3, GEO4, GEO5, GEO8; plan E15.1; builds on
  [ADR-006](006-d3-micro-libraries.md) and [ADR-008](008-pixel-space-orthographic-2d-camera.md)

## Context

A `geo` subplot turns longitude and latitude into pixels through one of Plotly's 82 projections,
clips to the projection's outline, cuts at the antimeridian and resamples long edges so they
curve. `d3-geo` does all of that on the CPU, for every projection, and it is what Plotly uses.
The alternative is to upload longitude and latitude once and project in the vertex shader.

The backlog's standing recommendation was the CPU for every projection, "a shader path only if
the GEO1 spike shows dragging a 50m world cannot hold 60 fps". GEO1 measured it
([spike F](../spikes/f-geo-projection.md)): land, countries, coastlines, borders and the graticule
through Holochart's fill and line primitives, 1024×640, an M1 Max, medians of three runs, in ms
per frame of a rotation (16.7 ms is 60 fps):

| Pipeline                                     | Orthographic | Natural Earth | Equirectangular |
| -------------------------------------------- | ------------ | ------------- | --------------- |
| 50m, d3-geo every frame                      | 94.6         | 89.2          | 88.6            |
| 50m, lines only / fills only                 | 23.1 / 71.2  | 18.5 / 71.2   | 18.5 / 70.8     |
| 50m, every CPU shortcut measured             | 32.1         | 32.4          | 31.8            |
| 110m, d3-geo every frame                     | 12.3         | 11.8          | 11.7            |
| 110m, with the same shortcuts                | 6.3          | 5.9           | 5.9             |
| 50m, projected in the vertex shader          | 2.3          | 3.1           | 3.0             |
| any resolution, pan or zoom without rotation | 1.1–2.6      | 1.1–2.6       | 1.1–2.6         |

So the condition is met: a 50m world rotates at 11 fps on the CPU. What else the spike found:

- **d3's clipping is the cost, not triangulation.** Of a 50m frame, d3-geo is 50–70 ms, earcut
  17–28 ms, upload and draw under 1 ms.
- **No CPU shortcut reaches 60 fps at 50m.** Skipping hidden features, closed-form maths for
  unclipped vertices and a cached triangulation together give 32 ms, because 20 to 30 very large
  polygons always cross the clip edge.
- **Pan and zoom need no reprojection.** Scaled and reprojected geometry agree to 10⁻⁵ px in every
  projection tried, Albers USA included. Only rotation reprojects. Resampling does drift under
  zoom: after 8× the Natural Earth graticule is 5.7 px off until it is reprojected.
- **The shader draws 50m with three quarters of the frame left, for a list of projections.** It
  needed the mesh cut by d3 first, densified to 2.5° and subdivided to 5° (1.5 to 2 times the
  vertices), three instances to hide triangles that span the antimeridian, and it has no answer
  for `rotation.lat` ≠ 0 on a flat projection. Its lines have no joins. Robinson is a table,
  the Mollweide family iterates, Albers USA is a composite: coverage is a list and never all 82.
- **The orthographic projection is a special case.** It is a sphere seen through an orthographic
  camera, which is the mesh GEO8's globe needs anyway, with depth doing the horizon.
- **Swapping 110m for 50m when a rotation ends is one 90 ms frame** if done at once.

## Decision

We will **project on the CPU through `d3-geo` for every projection, and draw the 110m basemap
while the view rotates**. We will not build a shader projection for the flat projections now.

- **One pipeline.** Geometry goes through `projection.stream` into preallocated typed arrays (not
  `geoProject`, which builds GeoJSON and costs 4–6 ms more at 50m), then to the fill and line
  primitives. What is on screen at rest is always d3-geo's output at the figure's `resolution`.
- **Pan and zoom are the camera.** Projected geometry lives in pixel space and a pan or zoom
  changes the data transform only (ADR-008). When a zoom settles the subplot reprojects, so
  resampled curves do not drift.
- **Rotation reprojects at 110m.** While `projection.rotation` changes, by a drag or an animation,
  the basemap is drawn from the 110m data whatever `resolution` says. When the rotation settles,
  the figure's resolution is drawn again. The swap is spread over frames by layer (lines first,
  then fills) or done in the calc worker (ADR-011), so that it is not one 90 ms frame.
- **First draw** follows the same rule: 110m first when `resolution` is 50, then 50m when idle.
- **Traces obey the same budget.** A `choropleth` or `scattergeo` whose geometry is too large to
  reproject in a frame is drawn simplified while rotating. GEO4 sets the vertex count at which
  that starts, measured the way the spike measured the basemap.
- **The shader path is not ruled out, and has one planned use.** GEO8 decides, with its sphere
  mesh in hand, whether the 2D orthographic projection is drawn by that mesh under an
  orthographic camera. Until then orthographic takes the CPU path like the others.

## Consequences

### Positive

- Every Plotly projection and every `rotation` value works through one code path, with the
  clipping, antimeridian cutting and resampling that d3-geo has had right for years.
- Nothing new in `packages/render` is needed to start GEO2: no projection hook in the shaders,
  no second mesh format.
- 60 fps while rotating at the default resolution with plain d3-geo, and what is drawn at rest is
  exact.
- Property tests have one reference: d3-geo's output.

### Negative

- **A map set to `resolution: 50` shows 110m coastlines while it rotates** and sharpens when it
  stops. At a world view the difference is small; zoomed in on a rotating flat projection it will
  be visible.
- **The budget is tight.** Plain d3-geo at 110m leaves 4–5 ms of a frame for the traces. The
  shortcuts that halve it (hidden-feature culling, a cached triangulation) are new code that GEO2
  has to write and test.
- **Large user geometry rotates slowly** unless it is simplified: 50m-sized GeoJSON costs what the
  50m basemap costs. The 3,000-county target in GEO4 is safe only because Albers USA pans and
  zooms without reprojecting.
- The numbers are from one fast machine. On a slower CPU even 110m may miss 60 fps.
- We give up the one design that rotates 50m smoothly.

### Follow-ups

- GEO2: the stream sink into typed arrays; ring grouping after clipping as tested code (d3 emits
  outer rings and holes in any order and sometimes rings with no area, and one such ring doubled
  earcut's time in the spike); the settle swap, measured as a sequence; reprojection after zoom.
- GEO2, in `packages/render`: `FillPrimitive` cannot take a prebuilt triangulation or move
  vertices without re-triangulating, `triangulateFills` allocates on every call, and
  `LinePrimitive.update` rebuilds its whole vertex stream. The first is needed for the cached
  triangulation.
- GEO3: measure 100k `scattergeo` markers under rotation. Markers have none of the mesh problems
  (no seams, no long edges), so a shader projection for points is the cheap first step if they
  are too slow on the CPU.
- GEO5: the basemap data is stitched across ±180° and the poles, not cut, so anything that
  triangulates in longitude and latitude must cut first.
- GEO8: build the sphere mesh as the spike did (241k vertices and 318k triangles at 50m, 7.2 MB,
  106–200 ms) and decide on drawing the 2D orthographic projection with it.
- Measure a mid-range laptop and a phone before GEO2 fixes the resolution rule.
- Check in plotly.js which gestures change `rotation` on a flat projection; the spike's note that
  a world-map drag does is from memory.

## Alternatives considered

### Shader projection for the common projections, d3-geo for the rest

50m at 60 fps while rotating, which nothing else gives. Not chosen: it is a second pipeline that
must agree with the first in pixels, it still needs d3-geo to build its mesh, it falls back to the
CPU for `rotation.lat` ≠ 0 and for every projection outside its list, its lines lack joins and
dashes, and hover, selection and traces on top were not tried under it. The gain is finer
coastlines during a gesture. If rotating at 110m proves unacceptable, this is the next step, and
the spike's prototype and its list of problems are where it starts.

### A faster CPU pipeline at 50m

Measured at 32 ms with every shortcut. The next steps (cutting the large polygons into tiles in
advance, or clipping without d3) were not measured and mean owning clipping code. Rejected as a
way to reach 60 fps at 50m; the shortcuts themselves are kept for 110m.

### 50m on the CPU, accepting the frame rate

11 fps during a drag. Rejected.

### Draw the basemap into a texture and warp it

Not measured. It would blur lines under zoom and does nothing for trace geometry.

## References

- [Spike F: reprojecting a world basemap on every frame](../spikes/f-geo-projection.md),
  `examples/_spikes/f-geo-projection.ts`
- `backlog.md`, "Before 1.0, epic: geographic charts", decision 2
- [ADR-006](006-d3-micro-libraries.md), [ADR-008](008-pixel-space-orthographic-2d-camera.md),
  [ADR-011](011-calc-in-web-worker.md), [ADR-024](024-geo-basemap-data.md)
