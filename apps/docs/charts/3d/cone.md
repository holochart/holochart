---
title: Cone plot
description: Draw a 3D vector field as cones sized and colored by the vector norms, in one instanced draw call.
status: complete
chart: cone
---

# Cone plot

## Overview

A cone plot (trace type `cone`) draws a 3D vector field, such as a flow velocity, a magnetic
field or a gradient, as one cone per sample in a [3D scene](/fundamentals/3d-scenes): each cone
sits at its position (`x`, `y`, `z`), points along its vector (`u`, `v`, `w`) and is sized and
colored by the vector's length (its norm). All cones of a trace are drawn in one instanced draw
call, so fields of tens of thousands of samples stay interactive.

Pick a different chart when:

- you want to follow the flow rather than see it at sample points:
  [stream tubes](/charts/3d/streamtube) trace paths through the field;
- the field is 2D: a quiver plot (planned) draws arrows on a flat plot;
- only the magnitude matters: a `surface` or [heatmap](/charts/scientific/heatmap) of the norms
  is easier to read.

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'cone',
      x: [0, 1, 2],
      y: [0, 0, 0],
      z: [0, 0, 0],
      u: [1, 0, 0],
      v: [0, 1, 0],
      w: [0, 0, 1],
    },
  ],
});
```

Three cones along the x axis point along x, y and z. By default each cone's center of mass is at
its position (`anchor: 'cm'`), the cones are scaled to fit between neighbouring positions
(`sizemode: 'scaled'`), and the norms are colored through the layout's sequential ramp with a
colorbar. The live example draws a vortex sampled on a 7 × 7 × 3 grid:

<Example id="cone/basic" />

## Data format

- `x`, `y`, `z`: the positions: numbers, dates or categories, as on any scene axis.
- `u`, `v`, `w`: the vector components (numbers). All six arrays must be non-empty, else the
  trace is not drawn; with different lengths, the shortest wins.
- The norm of each vector, `√(u² + v² + w²)`, sizes and colors its cone. Samples with a missing
  position or a zero or missing vector draw no cone.
- The cones' length follows `sizemode` and `sizeref`:
  - `'scaled'` (default): cones are scaled so that they fit between positions: the smallest
    travel time between successive samples, `2 |p₁ − p₀| / (|u₀| + |u₁|)` in coordinates scaled
    to the unit cube, times the norm, times `sizeref` (default 0.5).
  - `'absolute'`: the same, with `sizeref` in units of the norms: `sizeref / max norm`.
  - `'raw'`: each vector's own length in data units, times `sizeref` (default 1).
- `anchor` places the cone on its position: `'tip'`, `'tail'` (the base), `'cm'` (the center of
  mass, a quarter of the way from the base) or `'center'` (halfway). The base's radius is a
  quarter of the cone's length.
- Axis ranges include the cones: they are padded by the longest cone's reach from its position.

## Variations

### Sizing modes

The same field with each `sizemode`: `scaled` and `absolute` fit the cones to the sampling, and
`raw` draws the vectors' lengths as they are (here times 0.25).

<Example id="cone/sizemode" />

### Anchors

Four cones positioned on one plane (the gray band), one per `anchor`: `tip` ends at the plane,
`tail` starts at it, `cm` crosses it a quarter of the way along and `center` halfway.

<Example id="cone/anchor" />

### Colorscale and domain

`colorscale`, `cmin` and `cmax` map the norms: here Viridis over a fixed domain (faster vectors
clip to the last color) with a titled colorbar. `anchor: 'tail'` starts each cone at its sample.

<Example id="cone/colorscale" />

### A dense field

The Arnold–Beltrami–Childress flow on a 10 × 10 × 10 grid: 1,000 cones in one draw call.

<Example id="cone/abc-flow" />

## Styling

- **Colors.** The norms map through `colorscale` (or, without one, the layout's automatic ramp:
  `autocolorscale`), over `cmin` / `cmax` (default: the smallest and largest norm; `cmid`,
  `reversescale`), or a shared `coloraxis`. The colorbar (`showscale`, default on; `colorbar`)
  shows the mapping; the default `holochart` look slims it.
- **Opacity.** `opacity` below 1 draws the cones translucent, sorted back to front whenever the
  view changes.
- **Lighting.** `lighting.{ambient, diffuse, specular, roughness, fresnel}` and
  `lightposition.{x, y, z}` with Plotly's defaults (as for `mesh3d`), or the scene's `lighting`
  rig when it sets one.
- **Legend.** Cones are described by their colorbar and have no legend entry unless
  `showlegend: true`, as in Plotly.

## Interactivity

- **Hover.** The hovered cone's label shows its position (`x: …`, `y: …`, `z: …`), then, per
  `hoverinfo` (default `x+y+z+norm+text+name`), its vector (`u: …`, `v: …`, `w: …`, formatted
  like the x, y and z axes or by `uhoverformat`, `vhoverformat`, `whoverformat`), its norm
  (`norm: …`, 3 significant digits) and its `text`. `hovertemplate` can use `%{u}`, `%{v}`,
  `%{w}` and `%{norm}` besides `%{x}`, `%{y}`, `%{z}` and `%{text}`.
- **Events.** `hover` and `click` points carry `x`, `y`, `z`, `u`, `v`, `w`, `norm` and
  `pointNumber`:

  ```ts
  import { createChart } from '@mk7s/holochart';

  const chart = createChart(document.getElementById('chart')!, {
    data: [{ type: 'cone', x: [0], y: [0], z: [0], u: [1], v: [1], w: [0] }],
  });
  chart.on('click', (e) => console.log(e.points[0]?.pointNumber));
  ```

- **Camera.** Orbit, zoom and pan are the scene's (see [3D scenes](/fundamentals/3d-scenes)).

## Performance notes

- All cones of a trace are one instanced draw call: one 48-vertex cone mesh (gl-cone3d's 8
  segments) placed per instance on the GPU, with 8 floats of instance data per cone, so the cost
  grows with the number of cones times 48 vertices, and no geometry is built on the CPU.
- Positions are stored relative to the field's center in 32-bit floats (with a 64-bit origin), so
  large coordinates keep their precision.
- `sizemode: 'scaled'` scans the samples once per data change (O(n)).
- Translucent cones are re-sorted, and their instance data rewritten, whenever the camera moves.

## Accessibility notes

- **Screen readers:** the chart is a `<canvas>`; the hidden description (see the
  [accessibility guide](/guides/accessibility)) names the trace.
- **Keyboard:** Shift + arrow keys orbit the camera, `+` / `-` move it in and out and `0` resets it.
  There is no keyboard navigation between the trace's own points yet. See [the keys by chart
  family](/guides/accessibility#keys-by-chart-family).
- **Color:** the norms are shown twice, by size and by color, so the field reads without color
  too. Prefer ramps monotonic in lightness (the default ones are).

## Attribute reference

See the [cone attribute reference](/reference/cone) for every attribute, its type, and its
default. Shared color axes are under [`coloraxis`](/reference/layout#coloraxis) in the layout
reference.

## Related charts

- [3D mesh](/charts/3d/mesh3d): triangle meshes in the same scenes and lighting
- [3D scenes](/fundamentals/3d-scenes): cameras, axes and controls of every 3D trace

## Plotly migration notes

- Attribute names and defaults match Plotly's `cone`: `x`, `y`, `z`, `u`, `v`, `w`, `sizemode`,
  `sizeref`, `anchor`, the colorscale attributes, `opacity`, `lighting`, `lightposition`, `text`,
  `hovertext`, `hovertemplate`, `hoverinfo` (with the `u`, `v`, `w` and `norm` flags) and the
  hover formats. Cone sizes and anchors follow Plotly's formulas (plotly.js `cone/convert.js` and
  gl-cone3d).
- Not supported yet: `hovertemplatefallback`, and the `material` extension of meshes.
- Differences:
  - The scaled sizing uses the trace's own data span per axis; Plotly uses the span of every trace
    in the scene, which differs only with several traces in one scene.
  - Colors map each cone's norm directly through `cmin` / `cmax` (Plotly normalizes by the
    largest norm in its scaled coordinates, which only agrees when the axes have similar ranges).
  - The hover label takes the colorscale color of the cone (Plotly's default hover color).
