---
title: Volume
description: Draw a scalar field on a 3D grid as a volume, with stacked translucent isosurfaces as in Plotly or GPU ray marching, colored by value with an opacity scale.
status: complete
chart: volume
---

# Volume

## Overview

A `volume` trace draws a scalar field defined on a 3D grid (a density, a concentration, a
simulated or scanned volume) so that its inside shows: every value between `isomin` and
`isomax` is drawn translucent, colored through the colorscale, in a
[3D scene](/fundamentals/3d-scenes). `opacity` and `opacityscale` decide how much each value hides
what is behind it.

There are two ways to draw it (`render`, a Holochart extension):

- **`'isosurfaces'`** (the default, Plotly's): `surface.count` translucent isosurfaces stacked
  through the range, with the caps, slices and space frame of an
  [isosurface](/charts/3d/isosurface). Plotly figures look the same.
- **`'raymarch'`**: GPU ray marching. The values go to the GPU as a 3D texture and every pixel
  composites the colors and opacities along its ray: smooth, with no layering, and fast for large
  grids (a 256³ volume turns at 60 fps on an Apple M1 Max).

Pick a different chart when:

- one or two level surfaces are what matters: an [isosurface](/charts/3d/isosurface) draws them
  opaque and lit;
- the field is 2D: a [heatmap](/charts/scientific/heatmap) or a
  [surface](/charts/3d/surface).

`volume` is part of the full `@mk7s/holochart` bundle. With a
[script tag](/getting-started/installation#use-a-script-tag-cdn), load the 3D add-on
`holochart-3d.iife.min.js` after `holochart.iife.min.js`.

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

// A Gaussian blob on a 20³ grid, flattened (x changes fastest).
const x: number[] = [];
const y: number[] = [];
const z: number[] = [];
const value: number[] = [];
for (let k = 0; k < 20; k++) {
  for (let j = 0; j < 20; j++) {
    for (let i = 0; i < 20; i++) {
      const [px, py, pz] = [i / 19 - 0.5, j / 19 - 0.5, k / 19 - 0.5];
      x.push(px);
      y.push(py);
      z.push(pz);
      value.push(Math.exp(-(px * px + py * py + pz * pz) * 10));
    }
  }
}
createChart(document.getElementById('chart')!, {
  data: [{ type: 'volume', x, y, z, value, isomin: 0.2, opacity: 0.1, surface: { count: 12 } }],
});
```

The live example is Plotly's documentation example: `sin(xyz) / (xyz)` on a 40³ grid, 17
isosurfaces from 0.1 to 0.8 at `opacity: 0.1`:

<Example id="volume/basic" />

## Data format

- **`x`, `y`, `z`, `value`**: one entry per grid point, flattened columns of a rectilinear grid,
  exactly as for [isosurface](/charts/3d/isosurface#data-format): any nesting order and direction,
  uneven spacing allowed, typed arrays used as they are. Columns that don't make a complete grid
  draw nothing, as in Plotly.
- **`isomin`, `isomax`**: the value range drawn (default: the data's extent), also the automatic
  color domain.
- **Missing values** (`NaN`, non-numbers) are empty.
- **Scene.** `scene: 'scene2'` puts the trace in another scene (default `'scene'`).

## Variations

### Opacity scales

`opacityscale` maps values to opacities like a colorscale: `'min'` keeps the low values opaque,
`'max'` the high ones, `'extremes'` both ends, and a list of `[position, opacity]` stops anything
else (positions 0–1 of the color domain). It multiplies `opacity`.

<Example id="volume/opacityscale" />

### Stacked isosurfaces and ray marching

The same field drawn both ways: Plotly's stacked isosurfaces, and ray marching
(`render: 'raymarch'`), which draws every value in range, not just `surface.count` levels.

<Example id="volume/modes" />

### Ray marching

Ray-marched volumes take the colorscale for color and `opacity` · `opacityscale` for the opacity of
one grid cell of material; `raymarch.shading` shades by the value gradient (right).

<Example id="volume/raymarch" />

### A cutaway

Rays stop at the scene's axis ranges: a range smaller than the data cuts the volume open.
`isomin` / `isomax` keep a band of values (here the walls of a gyroid lattice).

<Example id="volume/clipped" />

## Styling

- **Colors.** `colorscale`, `reversescale`, `cauto`, `cmin`, `cmax`, `cmid`, `showscale` and
  `colorbar`, or `coloraxis`. The automatic color domain is `[isomin, isomax]`; the default look
  uses its sequential scale (`autocolorscale`), like Plotly.
- **Opacity.** `opacity` (1 by default, as in Plotly: set it low, e.g. 0.1, for stacked
  isosurfaces) and `opacityscale` (`'uniform'`, the default, `'min'`, `'max'`, `'extremes'` or
  stops). With stacked isosurfaces the scale applies twice, as in Plotly (gl-mesh3d uses it for
  both the vertex alpha and the colormap alpha). With ray marching, `opacity` is the opacity of one
  grid cell's thickness, so the look doesn't depend on the step.
- **Isosurface options** (stacked mode): `surface.{count, fill, pattern}`, `caps`, `slices`,
  `spaceframe` (`fill` 1 by default for volumes), `flatshading`, `lighting`, `lightposition`.

## Interactivity

- **Hover** snaps to the nearest grid point and shows its `x`, `y`, `z` and `value: …`
  (`valuehoverformat`), then its `text`; `hovertemplate` has `%{value}`. Stacked isosurfaces are
  picked on the GPU; a ray-marched volume casts the pointer's ray through the grid on the CPU and
  takes the first point where the volume becomes visible (the ray's opacity reaches 10 %).
- **Events**: `hover`, `unhover` and `click` report the grid point's `x`, `y`, `z` and `value`, with
  `pointNumber` its index in the columns.
- **Camera**: drag to turn, scroll to zoom, as in every [3D scene](/fundamentals/3d-scenes).

```ts
import { createChart } from '@mk7s/holochart';

declare const grid: { x: Float32Array; y: Float32Array; z: Float32Array; value: Float32Array };
const chart = createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'volume',
      ...grid,
      render: 'raymarch',
      opacity: 0.1,
      hovertemplate: '%{value:.2f}<extra></extra>',
    },
  ],
});
chart.on('hover', (event) => console.log(event.points[0]?.pointNumber));
```

## 3D-native options

- **`render: 'raymarch'`** (Holochart extension): GPU ray marching instead of stacked isosurfaces.
  `raymarch.step` sets the sample spacing in grid cells (0.5 by default; smaller is finer and
  slower), `raymarch.shading` lights the volume by its gradient (a light at the camera, with
  `lighting.ambient` and `lighting.diffuse`). `surface`, `caps`, `slices` and `spaceframe` apply
  to stacked isosurfaces only.
- **Materials** (`material.type`, stacked mode): three.js materials light the isosurfaces with the
  scene's lights.

## Performance notes

- **Ray marching** uploads the values once as an 8-bit 3D texture (a 256³ grid is 16 MB) and draws
  one box: the cost is per pixel and per sample, not per data point, and rays stop early once
  opaque. A 256³ volume orbits at 60 fps in a 1280 × 800 page on an Apple M1 Max (about 6.5 ms of
  GPU time per frame, 10 ms at a pixel ratio of 2), and its first draw, including the grid check
  and the upload, takes about 0.5 s (`pnpm bench:gpu --only volume/perf-256`). Values are
  quantized to 254 levels of the data range, finer than the colorscale's 256 entries.
- **Stacked isosurfaces** are extracted on the CPU like
  [isosurfaces](/charts/3d/isosurface#performance-notes), once per surface: the 17 surfaces of the
  first example (40³ grid) take about 150 ms and make 370,000 translucent triangles, sorted back
  to front when the camera moves. Prefer ray marching for large grids or many levels.
- Structured grids are read along their strides and typed-array columns are not copied, so a
  256³ grid is validated in about 0.2 s.

## Accessibility notes

- **Screen readers:** the chart is a `<canvas>`; the hidden description (see the
  [accessibility guide](/guides/accessibility)) names the trace.
- **Keyboard:** there is no keyboard navigation of 3D traces yet.
- **Color and depth:** translucent layers blend colors, which can mislead. Keep the colorbar,
  prefer lightness-monotonic colorscales, use `opacityscale` to bring out the values that matter,
  and consider [isosurfaces](/charts/3d/isosurface) or slices for exact levels.

## Attribute reference

See the [volume attribute reference](/reference/volume) for every attribute, its type, and its
default. Scene attributes (camera, axes, lighting) are under [`scene`](/reference/layout#scene) in
the layout reference.

## Related charts

- [Isosurface](/charts/3d/isosurface): opaque level surfaces of the same kind of data
- [3D scenes](/fundamentals/3d-scenes): the camera, axes, controls, hover and spikes every 3D
  trace shares
- [Heatmap](/charts/scientific/heatmap): a 2D slice of a field

## Plotly migration notes

- Attribute names and defaults match Plotly's `volume`: those of `isosurface` (see its
  [migration notes](/charts/3d/isosurface#plotly-migration-notes)) plus `opacityscale`; the
  space frame's `fill` defaults to 1. Volumes are hidden from the legend unless
  `showlegend: true`.
- The default rendering is Plotly's (stacked isosurfaces, the same triangles and opacity scale).
- `render: 'raymarch'` and `raymarch` are Holochart extensions; with them, `surface`, `caps`,
  `slices` and `spaceframe` are ignored, and opaque traces inside the volume hide the whole ray
  behind them (mixing both is approximate).
- Not supported yet: `contour`, `xcalendar` / `ycalendar` / `zcalendar`,
  `hovertemplatefallback`.
