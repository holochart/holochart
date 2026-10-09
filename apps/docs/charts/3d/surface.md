---
title: Surface
description: Draw a grid of heights as a lit 3D surface, colored by height or by a second field, with contour lines, wall projections, opacity scales and a wireframe.
status: complete
chart: surface
launch-featured: true
---

# Surface

<ChartOverview />

## Overview

A `surface` trace draws a grid of heights, `z[row][column]`, as a lit, colored surface in a
[3D scene](/fundamentals/3d-scenes). Use it for functions of two variables, response surfaces,
terrain and elevation models, and any measured field on a grid where the shape matters as much as
the values. Drag to turn the scene; hovering shows the nearest grid point's `x`, `y` and `z` and
draws its contour lines.

Holochart builds the surface on the GPU: the heights (and `x` / `y` when they are 2D) go to the GPU
as float textures, and the vertex shader places every point and computes its normal from its
neighbours. There are no vertex buffers, so a 1024 × 1024 grid is ready in a few tens of
milliseconds and new data of the same size only rewrites the textures. Contour lines and the
wireframe are drawn in the same shader, exact at any zoom.

Pick a different chart when:

- the values are what matters, not the shape: a [heatmap](/charts/scientific/heatmap) or a
  [contour plot](/charts/scientific/contour) shows a grid in 2D without hiding any part of it;
- the points are scattered, not on a grid: use [scatter3d](/charts/3d/scatter3d) (with
  `surfaceaxis`, or a Delaunay [mesh3d](/charts/3d/mesh3d) through the points);
- the surface is closed or arbitrary (not a grid): use [mesh3d](/charts/3d/mesh3d).

`surface` is part of the full `@mk7s/holochart` bundle. With a
[script tag](/getting-started/installation#use-a-script-tag-cdn), load the 3D add-on
`holochart-3d.iife.min.js` after `holochart.iife.min.js`.

## Minimal example

The figure sketch below shows the essential data shape. Open **Complete source** on the live
example for a runnable module with setup, dependencies and cleanup.

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'surface',
      z: [
        [1, 2, 3, 2],
        [2, 4, 5, 3],
        [1, 3, 4, 2],
      ],
    },
  ],
});
```

Without `x` and `y`, the columns sit at x = 0, 1, 2, … and the rows at y = 0, 1, 2, …. The
surface is colored by height through the colorscale, with a colorbar. The live example draws
MATLAB's `peaks` on a 50 × 50 grid; hover it to see a point's values and its contour lines:

<Example id="surface/basic" />

## Data format

- **`z`**: a 2D array, `z[row][column]`: rows run along y, columns along x. Rows may have
  different lengths (the longest sets the width; missing entries are gaps). Rows can be typed
  arrays (`Float64Array`, …).
- **`x`, `y`**: either vectors (one x per column, one y per row, in any order and spacing) or 2D
  arrays shaped like `z` (one x and y per point, for grids that are not rectangular: polar grids,
  parametric surfaces such as spheres). Without them, the indices. Numbers, dates and categories
  all work; values are kept relative to their center in float64, so dates keep their precision.
- **Gaps**: `null`, `NaN` and non-numeric entries in `z` (or `x`, `y`) are holes: every triangle
  touching them is dropped. `connectgaps: true` fills them by interpolating their neighbours
  first.
- **`surfacecolor`**: a 2D array like `z` whose values the colorscale maps instead of `z`.
- **Scene.** `scene: 'scene2'` puts the trace in another scene (default `'scene'`).

```ts
import { createChart } from '@mk7s/holochart';

// A polar grid: x and y as 2D arrays, one per point.
const r = [0, 0.5, 1, 1.5, 2];
const angle = Array.from({ length: 25 }, (_, k) => (k / 24) * 2 * Math.PI);
createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'surface',
      x: r.map((ri) => angle.map((a) => ri * Math.cos(a))),
      y: r.map((ri) => angle.map((a) => ri * Math.sin(a))),
      z: r.map((ri) => angle.map(() => Math.exp(-ri * ri))),
    },
  ],
});
```

## Variations

<ChartVariations />

### x and y vectors

One coordinate per column and per row, unevenly spaced here: the cells stretch with the data.

<ExampleLink id="surface/vectors" />

### A non-rectangular grid

`x` and `y` as 2D arrays: a polar grid of rings and spokes makes a round ripple.

<ExampleLink id="surface/matrices" />

### Colored by another field

`surfacecolor` colors a parametric sphere (x, y and z all 2D) by a temperature field; `cmin` and
`cmax` fix the colorbar.

<ExampleLink id="surface/surfacecolor" />

### Contour lines and a contour map

`contours.z.show` draws lines of constant height (`start`, `end`, `size`; `usecolormap` colors them
with the colorscale), and `project.z` draws them again on the floor of the axis box.

<ExampleLink id="surface/contours" />

### Profiles on the walls

`contours.x` and `contours.y` draw lines of constant x and y (at the axis ticks unless `start`,
`end` and `size` are given); `project.x` / `project.y` put them on the walls, which follow the
camera.

<ExampleLink id="surface/contours-xy" />

### Contour lines only

`hidesurface: true` keeps the contour lines and hides the surface.

<ExampleLink id="surface/hidesurface" />

### Opacity by value

`opacityscale` maps the normalized color value to an opacity, like a colorscale: here the values
near zero fade.

<ExampleLink id="surface/opacityscale" />

### Several surfaces

Surfaces share a scene like any 3D traces: bounds drawn translucent around an estimate.

<ExampleLink id="surface/multiple" />

### Gaps and connectgaps

Missing values leave holes; `connectgaps` fills them.

<ExampleLink id="surface/connectgaps" />

## Styling

- **Colors.** `colorscale`, `reversescale`, `cauto`, `cmin`, `cmax`, `cmid` (on `surfacecolor`
  when given, else `z`), `showscale` and `colorbar`, or `coloraxis` to share a scale with other
  traces. The default look uses its sequential scale; Plotly's default is `RdBu`. A one-color
  surface is a colorscale of one color: `colorscale: [[0, '#5ec8f2'], [1, '#5ec8f2']]`.
- **Opacity.** `opacity` for the whole surface, `opacityscale` by value (`[[0, 0.1], [1, 1]]`, or
  `'max'`, `'min'`, `'extremes'`).
- **Lighting.** Plotly's model: `lighting.ambient` (0.8), `diffuse` (0.8), `specular` (0.05),
  `roughness` (0.5), `fresnel` (0.2) and `lightposition` (`{ x: 10, y: 1e4, z: 0 }`, in clip space:
  the light moves with the view).
- **Contours.** Per axis (`contours.x`, `.y`, `.z`): `show`, `start` / `end` / `size`, `color`,
  `width` (px), `usecolormap`, `project`, and the highlight lines' `highlight`, `highlightcolor`,
  `highlightwidth`.

<ExampleLink id="surface/lighting" />

## Interactivity

- **Hover** snaps to the grid point nearest to where the pointer meets the surface and shows its
  `x`, `y` and `z` (`hoverinfo`, `xhoverformat` / `yhoverformat` / `zhoverformat`, `text`,
  `hovertext`). `hovertemplate` also has `%{surfacecolor}`. Spikes run from the point to the walls
  (`scene.xaxis.showspikes`, …).
- **Highlight lines**: while hovering, the lines of constant x, y and z through the hovered point
  are drawn (`contours.*.highlight`, on by default, as in Plotly).
- **Events**: `hover`, `unhover` and `click` report `x`, `y`, `z` (and `surfacecolor`) with
  `pointNumber: [row, column]`.
- **Camera**: drag to turn, scroll to zoom, as in every [3D scene](/fundamentals/3d-scenes).

```ts
import { createChart } from '@mk7s/holochart';

const chart = createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'surface',
      z: [
        [1, 2],
        [3, 4],
      ],
      hovertemplate: 'height %{z:.2f} at (%{x}, %{y})<extra></extra>',
    },
  ],
});
chart.on('click', (event) => {
  const point = event.points[0];
  console.log(point?.pointNumber, point?.z);
});
```

## 3D-native options

- **Wireframe** (Holochart extension): `wireframe: { show: true, step: 4, width: 1, color }` draws
  every `step`-th grid line over the surface, in the shader.
- **Materials** (`material.type`): `'flat'` draws the colors unlit; three.js materials
  (`'standard'`, `'physical'`, `'phong'`, …) light the surface with the scene's lights
  (`scene.lighting`), shadows and reflections. With three.js materials, contour and highlight lines
  and the wireframe are not drawn (projections are).

<ExampleLink id="surface/wireframe" />

## Performance notes

- The surface is one draw call with no vertex buffers: the heights (and 2D `x` / `y`) are float
  textures and every vertex is placed in the vertex shader. A 1024 × 1024 grid rebuilds (new
  heights of the same size) in about 40 ms and orbits at 60 fps on an Apple M1 Max
  (`pnpm bench:gpu --only surface/perf-1024`).
- Contour lines, highlights and the wireframe cost nothing extra on the CPU (they are drawn in
  the fragment shader). Projections onto the walls are computed on the CPU once per data or level
  change (up to 256 levels per axis).
- Hover casts a ray against the drawn triangles through a coarse bounding-box grid: well under a
  millisecond for a million points.
- Translucent surfaces are drawn back to front by walking the grid from its far side, without
  sorting triangles; overlapping translucent surfaces blend in trace order.
- The grid must fit in a GPU texture (typically 8192 or 16384 points per side).

## Accessibility notes

- **Screen readers:** the chart is a `<canvas>`; the hidden description names each surface, its
  grid size, the range of `x`, `y` and `z` and where the highest point is.
- **Keyboard:** Shift + arrow keys orbit the camera, `+` / `-` move it in and out and `0` resets it.
  There is no keyboard navigation between the trace's own points yet. See [the keys by chart
  family](/guides/accessibility#keys-by-chart-family).
- **Color and depth:** a surface's shape can hide parts of it from any one camera. Keep the
  colorbar, use a lightness-monotonic colorscale, add contour lines (and their projections) so
  levels read without turning the scene, and set a useful initial `scene.camera`. Consider a 2D
  [heatmap](/charts/scientific/heatmap) or [contour plot](/charts/scientific/contour) of the same
  data alongside.

## Attribute reference

See the [surface attribute reference](/reference/surface) for every attribute, its type, and its
default. Scene attributes (camera, axes, lighting) are under [`scene`](/reference/layout#scene) in
the layout reference.

## Related charts

- [3D scenes](/fundamentals/3d-scenes): the camera, axes, controls, hover and spikes every 3D
  trace shares
- [Heatmap](/charts/scientific/heatmap) and [contour plot](/charts/scientific/contour): the same
  grid in 2D
- [Mesh3D](/charts/3d/mesh3d): arbitrary triangle meshes
- [Scatter3D](/charts/3d/scatter3d): points, lines and a `surfaceaxis` surface through them

## Plotly migration notes

- Attribute names and defaults match Plotly's `surface`: `x`, `y`, `z`, `surfacecolor`, the `c`
  colorscale attributes (and the legacy `zauto` / `zmin` / `zmax`), `opacity`, `opacityscale`,
  `hidesurface`, `connectgaps`, `contours.{x, y, z}` with `project` and the highlight lines,
  `lighting`, `lightposition`, `text`, `hovertext`, the hover formats, `hoverinfo`,
  `hovertemplate` and `scene`. Surfaces are hidden from the legend unless `showlegend: true`.
- `wireframe` and `material` are Holochart extensions.
- Plotly resamples grids smaller than its minimum resolution (`refineData`) for smoother shading;
  Holochart draws the grid as given.
- Contour levels are evenly spaced: without `start` / `end` / `size`, the axis ticks (uneven
  ticks, such as months, are spread evenly between the first and the last). Levels take the
  current tick spacing, not the camera's (Plotly's follow the view).
- Highlight lines are not projected onto the walls.
- Hover events report `pointNumber` as `[row, column]`, like heatmaps.
- Not supported yet: `xcalendar` / `ycalendar` / `zcalendar`, and programmatic hover of 3D points
  (`chart.hover`).
