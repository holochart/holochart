---
title: Scatter3D
description: Plot points, lines and labels at x/y/z in a 3D scene, with colorscales, sprite or lit-sphere markers, error bars, wall projections and hover with spikes.
status: complete
chart: scatter3d
---

# Scatter3D

## Overview

A `scatter3d` trace draws markers, lines and text at `x`, `y`, `z` positions in a
[3D scene](/fundamentals/3d-scenes). Use it for point clouds and clusters in three variables,
trajectories and parametric curves, and labeled positions in space. The camera turns, zooms and
pans with the mouse, wheel or touch, and hovering a point shows its three coordinates, with spikes
to the walls.

Holochart draws each part of the trace (markers, line, text, error bars, each projection, the
surface) as one GPU draw call, whatever the number of points. Positions are uploaded once:
orbiting only moves the camera, so a million points stay interactive.

From a table of rows, [`hx.scatter3d` and `hx.line3d`](/express/mappings#3d-charts) (Express's
`px.scatter_3d` and `px.line_3d`) build one trace per group, with a legend, a colorscale for a
numeric `color`, marker sizes and animation frames.

Pick a different chart when:

- two variables are enough: a 2D [scatter plot](/charts/basic/scatter) (colored or sized by the
  third) is easier to read exactly than any projection of 3D;
- you have one `z` value per cell of an `x`–`y` grid: use a [heatmap](/charts/scientific/heatmap)
  or a [contour plot](/charts/scientific/contour) in 2D;
- you want to compare many dimensions at once: a [scatter plot matrix](/charts/statistical/splom)
  or [parallel coordinates](/charts/statistical/parallel-coordinates) show every pair or axis.

`scatter3d` is part of the full `@mk7s/holochart` bundle. With a
[script tag](/getting-started/installation#use-a-script-tag-cdn), load the 3D add-on
`holochart-3d.iife.min.js` after `holochart.iife.min.js`.

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'scatter3d',
      mode: 'markers',
      x: [1, 2, 3, 4, 5],
      y: [2, 1, 4, 3, 5],
      z: [3, 5, 1, 4, 2],
    },
  ],
});
```

The trace creates the default scene (`layout.scene`) and places each point at its `x`, `y`, `z`.
Without `mode`, points are drawn as `'lines+markers'`. The live example draws 600 points in three
clusters, colored by `z` through a colorscale with a colorbar; drag to turn it and hover a point:

<Example id="scatter3d/basic" />

## Data format

- **`x`, `y`, `z`**: one value per point, as arrays or typed arrays (`Float64Array`, …). Only the
  first `min(x.length, y.length, z.length)` points are drawn. A point with a missing or invalid
  coordinate (`null`, `NaN`) is a gap: it draws no marker and breaks the line, unless
  `connectgaps: true` joins its neighbors.
- **Axis types.** Numbers, dates and categories all work, per axis. The scene axis types are
  detected from the data, as on cartesian axes, or set with `scene.xaxis.type` (and `yaxis`,
  `zaxis`): `linear`, `log`, `date` or `category`. Positions are kept in float64 relative to the
  data's center, so dates keep their precision.
- **Per-point attributes.** `text`, `hovertext`, `customdata`, `marker.size`, `marker.color`,
  `marker.symbol` and `line.color` take one value per point (or a single value for all).
- **Scene.** `scene: 'scene2'` puts the trace in another scene (default `'scene'`); see
  [several scenes](/fundamentals/3d-scenes#several-scenes).

```ts
import { createChart } from '@mk7s/holochart';

// Dates on x, categories on y, a log z axis.
createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'scatter3d',
      x: ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26'],
      y: ['north', 'north', 'south', 'south'],
      z: [12, 140, 35, 900],
    },
  ],
  layout: { scene: { zaxis: { type: 'log' } } },
});
```

## Variations

### Lines colored along their length

`mode: 'lines'` joins the points with a screen-space line: `line.width` is in CSS px at every
depth. Numbers in `line.color` go through `line.colorscale` and are interpolated along each
segment. Here a helix is colored by its parameter, with diamond markers on every tenth point:

<Example id="scatter3d/helix" />

### Tubes

`line.render: 'tube'` (a Holochart extension) draws the line as a lit tube instead of a px-wide
band. `line.radius` is a fraction of the longest side of the scene's axis box (default 0.01), so
tubes stay round whatever the axis scales and grow and shrink with the view like the data. Here a
helix tube is colored along its length through a colorscale, and a thinner tube with a metallic
`line.material` winds around it:

<Example id="scatter3d/tube" />

### Ribbons

`line.render: 'ribbon'` sweeps the line along one axis into a lit strip: `line.ribbon.axis`
(`'x'`, `'y'` or `'z'`, default `'y'`) and `line.ribbon.width` in that axis's units (default a
twentieth of the axis range). Here twelve spectra, one trace per moment on the time (y) axis, form
a spectrogram-style waterfall, each ribbon 0.6 s wide and colored by amplitude:

<Example id="scatter3d/ribbons" />

### Marker symbols

`marker.symbol` takes Plotly's 3D set: `circle`, `circle-open`, `cross`, `diamond`,
`diamond-open`, `square`, `square-open` and `x`, one for the whole trace or one per point. Each
trace shows its glyph in the legend; click an entry to hide the trace:

<Example id="scatter3d/symbols" />

### Lit sphere markers

`marker.render: 'sphere'` (a Holochart extension) draws each marker as a shaded sphere, ray-cast
on the GPU, with exact silhouettes and intersections. Spheres keep the px size of sprite markers,
so bubble sizing (`sizeref`, `sizemin`, `sizemode`) works the same:

<Example id="scatter3d/spheres" />

### Text labels

`mode: 'markers+text'` writes `text` (or `texttemplate`) beside each point, at `textposition`
(default `'top center'`, one per point allowed). Labels face the camera, keep their px size and
are hidden behind nearer data (depth-tested):

<Example id="scatter3d/text" />

### Error bars

`error_x`, `error_y` and `error_z` take the 2D error bar attributes: `type` (`percent`,
`constant`, `sqrt`, `data`), `value` / `valueminus`, `array` / `arrayminus`, `symmetric`, `color`
and `thickness`. Each bar is a segment through its point along its axis, without caps, as in
Plotly. `copy_zstyle` on `error_x` / `error_y` copies the style of `error_z`. The scene's
autorange includes the bars' ends:

<Example id="scatter3d/error-bars" />

### Projections on the walls

`projection.x.show` (and `y`, `z`) draws the markers' shadows on the wall perpendicular to that
axis, at `projection.x.scale` of the marker size (default 2/3) and `opacity` (default 1). The
shadows go on the far walls, the ones behind the data, and move when the camera turns:

<Example id="scatter3d/projections" />

### A surface through the points

`surfaceaxis: 0`, `1` or `2` fills a surface through the points, triangulated (Delaunay) in the
plane perpendicular to the x, y or z axis; `-1` (the default) draws none. `surfacecolor` defaults
to the line or marker color. Here two closed loops are filled with `surfaceaxis: 2`:

<Example id="scatter3d/surfaceaxis" />

### Several traces

Traces share the scene and its axes, each with its own style and legend entry. Here three
clusters with different symbols and a dashed trajectory (`line.dash: 'dash'`):

<Example id="scatter3d/multiple-traces" />

### Date, category and log axes

One trace per region, with weekly dates on x, the region names on a category y axis, and a log
z axis:

<Example id="scatter3d/axis-types" />

## Styling

- **Mode.** `mode` combines `lines`, `markers` and `text` (default `'lines+markers'`).
- **Markers.** `marker.size` (px; per point for bubbles, with `sizeref`, `sizemin` and
  `sizemode`), `marker.symbol`, `marker.opacity` (one value for the trace) and
  `marker.line.color` / `width` for the rim.
- **Marker colors.** `marker.color` as CSS colors, or numbers mapped through `colorscale`,
  `cmin`, `cmax`, `cmid` and `reversescale`, with `showscale` and `colorbar` for a colorbar, or
  `coloraxis` to share a scale between traces. See
  [colors and colorscales](/fundamentals/colors-colorscales).
- **Lines.** `line.color` (CSS, or numbers through `line.colorscale` and its range attributes,
  with `line.showscale` / `line.colorbar`), `line.width` (CSS px) and `line.dash` (`solid`,
  `dot`, `dash`, `longdash`, `dashdot`, `longdashdot`, in CSS px).
- **Tubes and ribbons.** `line.render` (`'screen'`, the default, `'tube'` or `'ribbon'`; a
  Holochart extension) with `line.radius` for tubes and `line.ribbon.axis` / `line.ribbon.width`
  for ribbons. They take `line.color` like screen lines (one color, or numbers through
  `line.colorscale`, interpolated along the line), and are lit with `line.lighting` (defaults
  ambient 0.5, diffuse 0.7, specular 0.15, roughness 0.4, fresnel 0.2), `line.lightposition` and
  `line.material`. `line.width` and `line.dash` don't apply to them.
- **Text.** `text`, `texttemplate` (`%{x}`, `%{y}`, `%{z}`, `%{text}`, `%{customdata}`),
  `textposition` and `textfont`.
- **Default look.** In the default `holochart` template, markers are 5 px with rims in the
  background color, and colorbars are slim. `template: 'plotly-classic'` (or `'none'`) keeps
  Plotly's defaults: 8 px markers and 2 px lines
  ([themes and templates](/customization/themes-templates)).

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'scatter3d',
      mode: 'lines+markers+text',
      x: [0, 1, 2, 3],
      y: [0, 1, 0, 1],
      z: [0, 1, 2, 3],
      text: ['start', 'b', 'c', 'end'],
      texttemplate: '%{text} (%{z})',
      textposition: 'middle right',
      marker: { size: 6, symbol: 'square-open', color: [0, 1, 2, 3], colorscale: 'Viridis' },
      line: { width: 3, dash: 'dot', color: '#8a8fa3' },
    },
  ],
});
```

## Interactivity

- **Camera.** Drag to turn the scene, scroll or pinch to zoom, double-click to go back to the
  first view; the [scene controls](/fundamentals/3d-scenes#controls) list every gesture.
- **Hover.** Markers and lines are picked on the GPU, so the point you hover is the one you see
  (not one hidden behind it). The label sits at the point and reads `x: …`, `y: …`, `z: …`
  (plus `text`), each value formatted like its scene axis. `xhoverformat`, `yhoverformat` and
  `zhoverformat` (or `scene.xaxis.hoverformat`, …) set the formats, `hoverinfo` picks among
  `x+y+z+text+name`, and `hovertemplate` takes `%{x}`, `%{y}`, `%{z}`, `%{text}` and
  `%{customdata}`:

  ```ts
  import { createChart } from '@mk7s/holochart';

  createChart(document.getElementById('chart')!, {
    data: [
      {
        type: 'scatter3d',
        mode: 'markers',
        x: [1.2, 2.5, 3.1],
        y: [0.4, 1.8, 2.2],
        z: [10, 25, 18],
        customdata: ['A-17', 'B-02', 'C-44'],
        hovertemplate: 'sample %{customdata}<br>depth %{z:.1f} m<extra></extra>',
      },
    ],
  });
  ```

  Tubes and ribbons are picked too: hovering one hovers the data point its part of the mesh was
  built around.

  Hover is always `closest` in a scene, as in Plotly. `scene.hovermode: false` (or
  `layout.hovermode: false`) turns it off. While the camera moves the label is hidden; it comes
  back at the point's new place once the camera rests. See
  [hover and picking](/fundamentals/3d-scenes#hover-and-picking).

- **Spikes.** Hovering a point draws lines from it to the axis walls
  (`scene.xaxis.showspikes`, default on), and with `spikesides` along the other walls to the box
  edges; `spikecolor` and `spikethickness` style them. See
  [spikes](/fundamentals/3d-scenes#spikes).
- **Events.** `hover` and `click` points carry `x`, `y`, `z`, `curveNumber`, `pointNumber` and
  `customdata`. A click (a press and release without dragging) emits `click` with the hovered
  point:

  ```ts
  chart.on('click', (e) => {
    const p = e.points[0];
    if (p) console.log(p.curveNumber, p.pointNumber, p.x, p.y, p.z);
  });
  ```

- **Legend.** Each trace shows its marker or line glyph; clicking an entry toggles the trace.
- **Annotations.** `scene.annotations` anchor labels and arrows at 3D points; they follow the
  camera. See [annotations](/fundamentals/3d-scenes#annotations).

## 3D-native options

- **Sphere markers.** `marker.render: 'sphere'` draws lit, ray-cast spheres instead of the
  default flat `'sprite'` symbols (which face the camera, as in Plotly). Spheres keep the marker's
  px size and color, and read better where depth and overlaps matter; symbols don't apply to them.
- **Tubes and ribbons.** `line.render: 'tube'` or `'ribbon'` draws lines as lit meshes that
  scale with the view, instead of Plotly's px-wide screen lines. Tube frames are carried along the
  curve by rotation-minimizing parallel transport (the double reflection method), so tubes don't
  twist; each end has a flat cap. Ribbons are lit on both sides. `line.material` takes the
  [material types](/customization/materials-lighting#material-types-trace-material) of meshes.
- **Camera tours and auto-rotation.** [`chart.animateCamera`](/fundamentals/3d-scenes#camera-animation)
  flies the camera to a new view, and
  [`scene.autorotate`](/fundamentals/3d-scenes#auto-rotation) turns the scene like a turntable.

## Performance notes

- One draw call per part (markers, line, text, error bars, each projection, the surface),
  whatever the number of points. Orbiting, zooming and panning only move the camera: nothing is
  re-uploaded.
- Opaque markers and lines write depth and draw in any order. Translucent markers
  (`marker.opacity < 1`) are blended and depth-sorted as the camera moves, for traces of up to
  200,000 points; larger translucent traces are not sorted. Keep `opacity: 1` for the biggest
  clouds.
- A million markers orbit interactively. The `scatter3d/perf-1m` sandbox example draws them, and
  `pnpm bench:gpu --only scatter3d/perf-1m` measures the frame rate.
- Tubes and ribbons are meshes built on the CPU: a tube has 12 vertices per point plus 13 per cap
  (two caps per unbroken run), a ribbon 2 vertices per point. They are built in scene units, so
  they are rebuilt when the scene's layout changes (axis ranges, aspect ratio), not when the camera
  moves. Screen lines cost less for very long lines.
- Pass `x`, `y`, `z` as typed arrays to keep large inputs compact. Text labels cost more than
  markers per point; keep them for a few hundred points. See the
  [performance guide](/guides/performance).

## Accessibility notes

- **Screen readers:** the chart is a `<canvas>`; the hidden description (see the
  [accessibility guide](/guides/accessibility)) names each 3D scatter trace, its number of points
  and the range of each of `x`, `y` and `z`, formatted like the axes.
- **Keyboard:** Tab moves into the plot area; the arrow keys then step through the points in data
  order, each showing its hover label. Shift + arrow keys orbit the camera, `+` / `-` move it in and
  out and `0` resets it. See [the keys by chart family](/guides/accessibility#keys-by-chart-family).
- **Color and depth:** a 3D view hides depth on a flat screen. Give each trace a distinct symbol
  as well as a color, color by a value with a lightness-monotonic scale (the default, Viridis) and
  keep the colorbar, and consider sphere markers or projections so position reads without
  turning the scene. Set a useful initial `scene.camera`; not everyone can drag to explore.

## Attribute reference

See the [scatter3d attribute reference](/reference/scatter3d) for every attribute, its type, and
its default. Scene attributes (camera, axes, spikes, annotations) are under
[`scene`](/reference/layout#scene) in the layout reference.

## Related charts

- [3D scenes](/fundamentals/3d-scenes): the camera, axes, controls, hover, spikes and annotations
  every 3D trace shares
- [Express 3D charts](/express/mappings#3d-charts): `scatter3d` / `line3d` figures from tabular
  data, grouped by color, symbol and line
- [Scatter](/charts/basic/scatter): the same markers, lines and text in 2D
- [Bubble chart](/charts/basic/bubble): encode a third variable as marker size in 2D
- [Scatter plot matrix](/charts/statistical/splom): every pair of many variables at once

## Plotly migration notes

- Attribute names and defaults match Plotly's `scatter3d`: `x`, `y`, `z`, `mode`, `marker`
  (symbols, sizes, colorscales, `line`), `line` (colors, colorscales, `width`, `dash`),
  `connectgaps`, `text`, `texttemplate`, `textposition`, `textfont`, `error_x` / `error_y` /
  `error_z`, `projection`, `surfaceaxis`, `surfacecolor`, the hover formats, `hoverinfo`,
  `hovertemplate`, `hovertext`, `customdata` and `scene`. Hover labels and their formats match
  Plotly's gl3d.
- `marker.render` (`'sprite'` or `'sphere'`) is a Holochart extension; `'mesh'` is planned.
- `line.render` (`'screen'`, `'tube'` or `'ribbon'`) and its `line.radius`, `line.ribbon`,
  `line.lighting`, `line.lightposition` and `line.material` are Holochart extensions. The default,
  `'screen'`, is Plotly's line; Plotly ignores the others and draws screen lines.
- Error bars have no caps (as in Plotly); `width` is accepted but ignored.
- Projections are camera-facing sprites drawn on the walls (Plotly flattens them onto the wall).
- The `surfaceaxis` surface is flat-shaded (unlit).
- Line dashes follow the 2D dash patterns, in CSS px.
- The `cross` and `x` symbols are the 2D (filled) glyphs.
- Not supported yet: programmatic hover of 3D points (`Fx.hover` / `chart.hover`), hover on
  text-only traces (no markers or lines), and drawing the `hovertext` label of annotations (as in
  2D).
