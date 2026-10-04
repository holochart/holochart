---
title: Stream tubes
description: Trace the flow of a 3D vector field with tubes colored by speed and sized by divergence.
status: complete
chart: streamtube
---

# Stream tubes

## Overview

A stream tube plot (trace type `streamtube`) follows a 3D vector field, such as a fluid velocity
or a magnetic field, from starting points: each tube is a streamline, the path a massless particle
would take through the field, drawn as a lit tube in a [3D scene](/fundamentals/3d-scenes). The
tube's color shows the field's magnitude (its norm, e.g. the speed) along the way and its radius
the field's divergence, so sources and sinks swell the tubes. The field is given on a grid and
interpolated between the grid nodes.

Pick a different chart when:

- you want to see the field's direction everywhere rather than along a few paths:
  [cones](/charts/3d/cone) draw one arrow per sample;
- the field is 2D: streamlines on a flat plot (planned) are easier to read;
- only the magnitude matters: a `surface` or [heatmap](/charts/scientific/heatmap) of the norms
  is simpler.

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

// A 3 × 3 × 3 grid over [0, 2]³ with the field (1, 0.5, 0) everywhere, x varying fastest.
const x: number[] = [];
const y: number[] = [];
const z: number[] = [];
for (const zi of [0, 1, 2]) {
  for (const yi of [0, 1, 2]) {
    for (const xi of [0, 1, 2]) {
      x.push(xi);
      y.push(yi);
      z.push(zi);
    }
  }
}
createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'streamtube',
      x,
      y,
      z,
      u: x.map(() => 1),
      v: x.map(() => 0.5),
      w: x.map(() => 0),
    },
  ],
});
```

Without `starts`, the tubes start on the x–z plane at the grid's lowest y, at every x and z node
but the first and last (here one tube at x = 1, z = 1), as in Plotly. The norms are colored
through the layout's sequential ramp with a colorbar. The live example follows a tornado rising
along y, sampled on a 7 × 9 × 7 grid, from the default 5 × 5 starting plane:

<Example id="streamtube/basic" />

## Data format

- `x`, `y`, `z`: the grid nodes, flattened: every node of a rectilinear grid (the spacing may
  vary per axis), one axis varying fastest (any of the six orders), each axis ascending or
  descending — what nested loops over three coordinate lists produce. Numbers, dates or
  categories, as on any scene axis. Other point sets (scattered points, curvilinear grids, fewer
  entries than nodes) draw nothing, as in Plotly.
- `u`, `v`, `w`: the vector at each node (numbers). All six arrays must be non-empty, else the
  trace is not drawn; with different lengths, the shortest wins.
- `starts.x`, `starts.y`, `starts.z`: where tubes start (the shortest of the three wins). A
  start outside the field (beyond one grid cell around it) draws nothing.
- Between nodes the field is interpolated trilinearly; outside the grid it keeps the value of the
  nearest grid point.
- Each tube is integrated forward from its start with fourth-order Runge–Kutta steps and sampled
  every 1 / 100 of the field's diagonal (10 / `maxdisplayed` of it). It ends after `maxdisplayed`
  samples (default 1000), one step after leaving the field (and a margin of one grid cell), or
  where the flow stops.
- The tube radius at each sample is the field's divergence there — gl-streamtube3d's measure, the
  length of the sum of the field's partial derivatives, `|∂V/∂x + ∂V/∂y + ∂V/∂z|`, in coordinates
  scaled to the unit cube — times a scale that makes the thickest tubes of neighbouring starts just
  touch, times `sizeref` (default 1). A field without divergence gets thin tubes of one radius.
- Axis ranges include the tubes: the samples' extent, padded by the largest radius.

## Variations

### Starting points

Nine tubes started from a 3 × 3 patch of the Arnold–Beltrami–Childress flow (a 16³ grid), thinned
with `sizeref: 0.3`.

<Example id="streamtube/starts" />

### Tube size

A source and a sink with tubes started around the source: the tubes swell where the flow spreads
out of the source and gathers into the sink. `sizeref` scales them: 0.4 on the left, 1.5 on the
right (both traces share a `coloraxis`).

<Example id="streamtube/sizeref" />

### Tube length and sampling

`maxdisplayed` caps the samples per tube and sets the sampling step with it: the default 1000 on
the left, 60 on the right (a coarser step, so shorter, faceted tubes).

<Example id="streamtube/maxdisplayed" />

### Colorscale and domain

`colorscale`, `cmin` and `cmax` map the speed: here Viridis over a fixed domain (the fastest
flow, near the poles, clips to the last color) with a titled colorbar.

<Example id="streamtube/colorscale" />

## Styling

- **Colors.** Each sample's norm maps through `colorscale` (or, without one, the layout's
  automatic ramp: `autocolorscale`), over `cmin` / `cmax` (default: the smallest and largest norm
  on the grid; `cmid`, `reversescale`), or a shared `coloraxis`. Colors are interpolated along
  the tube per pixel. The colorbar (`showscale`, default on; `colorbar`) shows the mapping; the
  default `holochart` look slims it.
- **Size.** `sizeref` scales every radius; the radius itself follows the divergence (see Data
  format).
- **Opacity.** `opacity` below 1 draws the tubes translucent, sorted back to front whenever the
  view changes.
- **Lighting.** `lighting.{ambient, diffuse, specular, roughness, fresnel}` and
  `lightposition.{x, y, z}` with Plotly's defaults (as for `mesh3d`), the scene's `lighting` rig
  when it sets one, or a three.js material with `material.type` (Holochart extension).
- **Legend.** Stream tubes are described by their colorbar and have no legend entry unless
  `showlegend: true`, as in Plotly.

## Interactivity

- **Hover.** The label shows the tube sample nearest to the pointer: its position (`x: …`,
  `y: …`, `z: …`), then, per `hoverinfo` (default `x+y+z+norm+text+name`), the field's vector
  there (`u: …`, `v: …`, `w: …`, formatted like the x, y and z axes or by `uhoverformat`,
  `vhoverformat`, `whoverformat`), its norm (`norm: …`) and the divergence (`divergence: …`), both
  with 3 significant digits, and the trace's `text`. `hovertemplate` can use Plotly's
  `%{tubex}`, `%{tubey}`, `%{tubez}`, `%{tubeu}`, `%{tubev}`, `%{tubew}`, `%{norm}` and
  `%{divergence}` (and `%{x}`, `%{y}`, `%{z}`, `%{u}`, `%{v}`, `%{w}`).
- **Events.** `hover` and `click` points carry the same fields and `pointNumber` (the sample's
  index over all tubes):

  ```ts
  import { createChart } from '@mk7s/holochart';

  const x = [0, 1, 0, 1, 0, 1, 0, 1];
  const y = [0, 0, 1, 1, 0, 0, 1, 1];
  const z = [0, 0, 0, 0, 1, 1, 1, 1];
  const chart = createChart(document.getElementById('chart')!, {
    data: [{ type: 'streamtube', x, y, z, u: x.map(() => 0), v: x.map(() => 1), w: z }],
  });
  chart.on('hover', (e) => console.log(e.points[0]?.['norm'], e.points[0]?.['divergence']));
  ```

- **Camera.** Orbit, zoom and pan are the scene's (see [3D scenes](/fundamentals/3d-scenes)).

## Performance notes

- The tubes are integrated on the CPU when the data changes: 100 tubes through a 32³ grid take a
  few tens of milliseconds. The cost grows with the number of starts times the samples per tube
  (`maxdisplayed`), not with the grid size (sampling a node is a binary search per axis).
- All tubes of a trace are one mesh and one draw call: 8 vertices per sample and 16 triangles per
  segment, so 100 tubes of 1000 samples are 800,000 vertices.
- The rings are round in scene units, so the mesh is rebuilt when the scene's aspect ratio or
  axis ranges change; camera moves cost nothing on the CPU.
- Positions are stored relative to the tubes' center in 32-bit floats (with a 64-bit origin), so
  large coordinates keep their precision.

## Accessibility notes

- **Screen readers:** the chart is a `<canvas>`; the hidden description (see the
  [accessibility guide](/guides/accessibility)) names the trace.
- **Keyboard:** Shift + arrow keys orbit the camera, `+` / `-` move it in and out and `0` resets it.
  There is no keyboard navigation between the trace's own points yet. See [the keys by chart
  family](/guides/accessibility#keys-by-chart-family).
- **Color:** the norm is shown by color only; pair it with hover values, or prefer ramps monotonic
  in lightness (the default ones are).

## Attribute reference

See the [streamtube attribute reference](/reference/streamtube) for every attribute, its type, and
its default. Shared color axes are under [`coloraxis`](/reference/layout#coloraxis) in the layout
reference.

## Related charts

- [Cone plot](/charts/3d/cone): the same kind of field as one arrow per sample
- [3D mesh](/charts/3d/mesh3d): triangle meshes in the same scenes and lighting
- [3D scenes](/fundamentals/3d-scenes): cameras, axes and controls of every 3D trace

## Plotly migration notes

- Attribute names and defaults match Plotly's `streamtube`: `x`, `y`, `z`, `u`, `v`, `w`,
  `starts`, `maxdisplayed`, `sizeref`, the colorscale attributes, `opacity`, `lighting`,
  `lightposition`, `text`, `hovertext`, `hovertemplate`, `hoverinfo` (with the `u`, `v`, `w`,
  `norm` and `divergence` flags) and the hover formats. The grid rules, the default starts, the
  sampling step, the stopping box and the radius formula follow plotly.js `streamtube` and
  gl-streamtube3d.
- Not supported yet: `hovertemplatefallback`.
- Differences:
  - Tubes are integrated with Runge–Kutta (RK4) steps instead of gl-streamtube3d's Euler steps,
    so curved flow is followed accurately (on a rotation, Plotly's tubes spiral outwards). The
    samples keep Plotly's spacing.
  - Tubes also end where the flow stalls (too slow to reach the next sample within Plotly's step
    budget) instead of running out that budget; the drawn tubes are the same.
  - The divergence is computed analytically from the interpolated field instead of by a forward
    difference, which only differs within 1e-4 of a grid face.
  - Start coordinates closer than 1e-9 of their size count as equal when sizing the tubes (Plotly
    compares exact values, so rounding noise, e.g. starts on a circle, makes its tubes vanish).
  - Each ring is carried along its tube without twisting (gl-streamtube3d orients every ring on
    its own).
  - Colors and the hover norm are each sample's actual norm (Plotly rescales them so that the
    fastest sample of all tubes reaches the grid's largest norm), and the hover label takes the
    colorscale color.
  - Coordinates are scaled by the trace's own data span per axis; Plotly uses the span of every
    trace in the scene, which only differs with several traces in one scene. The autorange pads
    the samples by the largest tube radius (Plotly by a value mixing scaled and data units).
  - Events keep `x`, `y`, `z` next to Plotly's `tubex`, `tubey`, `tubez`, and `pointNumber` is
    the sample (Plotly's is a triangle of its mesh).
