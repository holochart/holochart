---
title: Isosurface
description: Draw the level surfaces of a scalar field on a 3D grid, between two values, with caps, slices and a space frame, colored by value.
status: complete
chart: isosurface
---

# Isosurface

<ChartOverview />

## Overview

An `isosurface` trace draws the surfaces where a scalar field defined on a 3D grid takes a given
value (level surfaces), in a [3D scene](/fundamentals/3d-scenes). Use it for densities,
concentrations, potentials, medical and simulation volumes, and implicit shapes: anything measured
or computed at every point of a 3D grid, where the shape of a level matters.

Between `isomin` and `isomax`, Holochart draws `surface.count` isosurfaces, closes them where the
grid cuts them (`caps`), and can add planar `slices` and a `spaceframe` of the grid cells. It
extracts the triangles exactly as plotly.js does (each grid cell cut into five tetrahedra, then
marching tetrahedra), so Plotly figures look the same; hovering shows the nearest grid point's
`x`, `y`, `z` and value.

Pick a different chart when:

- you want to see the whole field at once, including its soft gradients: draw a
  [volume](/charts/3d/volume) (stacked translucent isosurfaces, or GPU ray marching);
- the field is 2D: a [contour plot](/charts/scientific/contour) or
  [surface](/charts/3d/surface);
- you already have triangles: a [mesh3d](/charts/3d/mesh3d).

`isosurface` is part of the full `@mk7s/holochart` bundle. With a
[script tag](/getting-started/installation#use-a-script-tag-cdn), load the 3D add-on
`holochart-3d.iife.min.js` after `holochart.iife.min.js`.

## Minimal example

The figure sketch below shows the essential data shape. Open **Complete source** on the live
example for a runnable module with setup, dependencies and cleanup.

```ts
import { createChart } from '@mk7s/holochart';

// value = x² + y² + z² on a 4 × 4 × 4 grid, flattened (x changes fastest).
const x: number[] = [];
const y: number[] = [];
const z: number[] = [];
const value: number[] = [];
for (let k = 0; k < 4; k++) {
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      x.push(i);
      y.push(j);
      z.push(k);
      value.push(i * i + j * j + k * k);
    }
  }
}
createChart(document.getElementById('chart')!, {
  data: [{ type: 'isosurface', x, y, z, value, isomin: 4, isomax: 12 }],
});
```

The two isosurfaces (at `isomin` and `isomax`) are colored by value through the colorscale, with a
colorbar. The live example is Plotly's documentation example: nested ellipsoids of
`x²/2 + y² + 2z²` on a 30³ grid, the x and y caps hidden so the cut surfaces stay open:

<Example id="isosurface/basic" />

## Data format

- **`x`, `y`, `z`, `value`**: one entry per grid point, flattened columns of a rectilinear grid
  (NumPy's `mgrid(...).flatten()`, or nested loops as above). The axes can be nested in any order
  (x, y or z changing fastest) and run in either direction; the grid spacing can be uneven. Typed
  arrays (`Float32Array`, `Float64Array`) are used as they are, which keeps large grids cheap.
- **Grid check**: as in Plotly, the columns must describe a complete grid, every coordinate
  increasing along its own axis; otherwise nothing is drawn (Plotly warns about "arbitrary
  coordinates").
- **`isomin`, `isomax`**: the value range drawn (default: the data's extent). `isomin` above
  `isomax` drops both.
- **Dates and categories** work on the axes like any 3D trace; values are numbers.
- **Scene.** `scene: 'scene2'` puts the trace in another scene (default `'scene'`).

## Variations

<ChartVariations />

### Surface count, fill and pattern

`surface.count` spreads that many isosurfaces over `[isomin, isomax]`; `surface.fill` below 1 draws
every triangle as a frame around a hole, so inner surfaces show through; `surface.pattern` keeps a
subset of each grid cell's five tetrahedra (`'A'`–`'E'` and their combinations) or a checkerboard
of cells (`'odd'`, `'even'`).

<ExampleLink id="isosurface/surface-options" />

### Caps

Caps close the solid where the grid's boundary cuts it: on each face of the grid, the part whose
values are in range. They are on by default (`caps.x.show`, `.y`, `.z`).

<ExampleLink id="isosurface/caps" />

### Slices

`slices.z.show` draws planes of constant z through the grid, colored by value where it is in range:
at `locations` (between grid planes, interpolated), or at every inner grid plane without them.

<ExampleLink id="isosurface/slices" />

### Space frame

`spaceframe.show` draws the central tetrahedron of every grid cell inside the range as thin frames
(`spaceframe.fill`, 0.15 by default): the lattice the field was sampled on.

<ExampleLink id="isosurface/spaceframe" />

## Styling

- **Colors.** `colorscale`, `reversescale`, `cauto`, `cmin`, `cmax`, `cmid`, `showscale` and
  `colorbar`, or `coloraxis` to share a scale with other traces. The automatic color domain is
  `[isomin, isomax]`. The default look uses its sequential scale (`autocolorscale`), like Plotly.
- **Opacity.** `opacity` for the whole trace (translucent triangles are sorted back to front when
  the camera moves).
- **Lighting.** Plotly's model: `lighting.ambient` (0.8), `diffuse` (0.8), `specular` (0.05),
  `roughness` (0.5), `fresnel` (0.2), `facenormalsepsilon` (0 for isosurfaces) and
  `lightposition` (`{ x: 1e5, y: 1e5, z: 0 }`). `flatshading` is on by default, as in Plotly.
- **Fill.** `surface.fill`, `caps.*.fill`, `slices.*.fill` and `spaceframe.fill` set the drawn
  share of every triangle.

```ts
import { createChart } from '@mk7s/holochart';

declare const grid: { x: number[]; y: number[]; z: number[]; value: number[] };
createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'isosurface',
      ...grid,
      colorscale: 'Viridis',
      opacity: 0.6,
      lighting: { ambient: 0.5, diffuse: 0.9, specular: 0.3 },
      caps: { z: { show: false } },
    },
  ],
});
```

## Interactivity

- **Hover** finds the surface under the pointer (GPU picking), snaps to the nearest grid point and
  shows its `x`, `y` and `z`, then `value: …` (always, as in Plotly; `valuehoverformat`), then its
  `text` (`hoverinfo`, `xhoverformat` / `yhoverformat` / `zhoverformat`, `hovertext`).
  `hovertemplate` has `%{value}`. Spikes run from the point to the walls.
- **Events**: `hover`, `unhover` and `click` report the grid point's `x`, `y`, `z` and `value`, with
  `pointNumber` its index in the columns.
- **Camera**: drag to turn, scroll to zoom, as in every [3D scene](/fundamentals/3d-scenes).

```ts
import { createChart } from '@mk7s/holochart';

declare const grid: { x: number[]; y: number[]; z: number[]; value: number[] };
const chart = createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'isosurface',
      ...grid,
      hovertemplate: 'density %{value:.3f} at (%{x}, %{y}, %{z})<extra></extra>',
    },
  ],
});
chart.on('click', (event) => console.log(event.points[0]?.pointNumber));
```

## 3D-native options

- **Materials** (`material.type`): `'flat'` draws the colors unlit; three.js materials
  (`'standard'`, `'physical'`, `'phong'`, …) light the surfaces with the scene's lights
  (`scene.lighting`), shadows and reflections.
- For a soft, whole-field view of the same data, draw it as a [volume](/charts/3d/volume), with
  GPU ray marching (`render: 'raymarch'`).

## Performance notes

- The triangles are extracted on the CPU, once per data or option change. Every grid cell is
  visited once per surface: on an Apple M1 Max, a 64³ grid with two surfaces and caps (350,000
  triangles) takes about 0.15 s, and the time grows with the grid size and `surface.count`.
- Like Plotly, the extracted triangles share no vertices (three per triangle), so large surfaces
  take memory: about 100 bytes per triangle on the CPU. Keep `surface.count` and the grid size in
  proportion; for dense fields, consider a ray-marched [volume](/charts/3d/volume).
- Structured grids (the usual flattened `mgrid` or loops) are read along their strides, without
  sorting; typed-array columns are not copied.
- The surfaces draw in one call with the mesh primitive, whose code loads the first time a scene
  draws a mesh. Translucent surfaces re-sort their triangles when the camera moves (up to 500,000
  triangles).
- The extraction is a pure function of typed arrays, ready to move to a worker (not done yet).

## Accessibility notes

- **Screen readers:** the chart is a `<canvas>`; the hidden description (see the
  [accessibility guide](/guides/accessibility)) names the trace.
- **Keyboard:** Shift + arrow keys orbit the camera, `+` / `-` move it in and out and `0` resets it.
  There is no keyboard navigation between the trace's own points yet. See [the keys by chart
  family](/guides/accessibility#keys-by-chart-family).
- **Color and depth:** inner surfaces can hide behind outer ones. Use `surface.fill`, `opacity` or
  a `slices` plane to open them up, keep the colorbar, prefer lightness-monotonic colorscales and
  set a useful initial `scene.camera`.

## Attribute reference

See the [isosurface attribute reference](/reference/isosurface) for every attribute, its type,
and its default. Scene attributes (camera, axes, lighting) are under
[`scene`](/reference/layout#scene) in the layout reference.

## Related charts

- [Volume](/charts/3d/volume): the same data drawn as many translucent isosurfaces, or ray-marched
- [3D scenes](/fundamentals/3d-scenes): the camera, axes, controls, hover and spikes every 3D
  trace shares
- [Surface](/charts/3d/surface): a height field over a 2D grid
- [Mesh3D](/charts/3d/mesh3d): arbitrary triangle meshes

## Plotly migration notes

- Attribute names and defaults match Plotly's `isosurface`: `x`, `y`, `z`, `value`, `isomin`,
  `isomax`, `surface.{show, count, fill, pattern}`, `caps.{x, y, z}.{show, fill}`,
  `slices.{x, y, z}.{show, locations, fill}`, `spaceframe.{show, fill}`, the colorscale
  attributes, `opacity`, `flatshading`, `lighting`, `lightposition`, `text`, `hovertext`, the
  hover formats, `hoverinfo`, `hovertemplate` and `scene`. Isosurfaces are hidden from the legend
  unless `showlegend: true`.
- The triangles are Plotly's: the same five-tetrahedra cells, levels, caps, slices, fills and
  patterns, including its quirks (slices between grid planes are drawn once per internal pass).
  Differences: spaceframe corners and slices on descending axes are placed correctly for every
  grid order (Plotly assumes one), and interpolated points stay on their cell edge for value steps
  near 1e-9.
- Hover snaps to the nearest grid point; Plotly takes, per axis, the grid value at or above the
  picked vertex.
- `material` is a Holochart extension.
- Not supported yet: `contour` (Plotly's hover iso-line), `xcalendar` / `ycalendar` /
  `zcalendar`, `hovertemplatefallback`.
