---
title: 3D bars
description: Draw a matrix of values as lit 3D columns on a categorical or numeric x/y grid, stacked across traces, in one instanced draw call per trace.
status: complete
chart: bar3d
---

# 3D bars

<ChartOverview />

::: info Holochart extension
`bar3d` is not a Plotly trace type: Plotly has no 3D bar chart. Figures that use it only render in
Holochart. Its attributes follow Plotly's conventions (`marker`, colorscales, `lighting`,
`hoverinfo`, …), so they read like any other trace.
:::

## Overview

A 3D bar chart (trace type `bar3d`) draws one box per value in a
[3D scene](/fundamentals/3d-scenes): each bar stands at its `x`, `y` position and rises by its
height `z`. Use it for a matrix of values with two categorical or numeric dimensions, such as sales
by product and region, a bivariate histogram, or a value per month and year, and for stacks of
such values across traces. Each trace draws all of its bars in one instanced draw call, lit like
the other 3D meshes, and every bar can be hovered.

Pick a different chart when:

- values must be compared exactly: a 3D view distorts heights with perspective, and nearer bars
  hide farther ones. A [heatmap](/charts/scientific/heatmap) of the same matrix, or grouped
  [2D bars](/charts/basic/bar), are easier to read;
- the grid is dense and smooth: a `surface` shows the shape with less clutter;
- the positions are scattered rather than on a grid: a [3D scatter](/charts/3d/scatter3d) with
  markers sized or colored by the value.

`bar3d` is part of the full `@mk7s/holochart` bundle, like the other 3D traces. With a
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
      type: 'bar3d',
      x: ['a', 'b', 'c', 'a', 'b', 'c'],
      y: ['p', 'p', 'p', 'q', 'q', 'q'],
      z: [3, 5, 2, 6, 2, 5],
    },
  ],
});
```

Six bars on a 3 × 2 grid of categories, each from 0 up to its `z`. By default a bar covers 0.8 of
its category cell along x and y, takes the colorway's first color, and has thin edges. The live
example draws revenue of five products in four regions, one trace per region, so each
row gets its own color and legend entry; hover a column for its product, region and value:

<Example id="bar3d/matrix" />

## Data format

- **`x`, `y`**: the center of each bar: numbers, dates or categories, per scene axis (detected
  from the data or set with `scene.xaxis.type` and `scene.yaxis.type`). A bar is drawn when its
  `x`, `y` and `z` are all valid.
- **`z`**: the bar heights, in z data units. A bar spans `base` → `base + z`: negative heights go
  down. Zero-height bars and bars with a missing height (`null`, `NaN`) draw nothing. All three
  arrays must be non-empty, else the trace is not drawn; with different lengths, the shortest wins.
- **`base`**: where the bars start on the z axis (default 0), one number or one per bar.
- **`width`, `depth`**: the bar's footprint along x and along y, in axis units (one category is 1,
  dates are in milliseconds), one number or one per bar. The default is 0.8 of the smallest
  distance between the trace's distinct positions on that axis (1 with a single position), so a
  regular grid leaves a fifth of each cell empty.
- **`stackgroup`**: a name. `bar3d` traces of the same scene with the same non-empty `stackgroup`
  stack in trace order: at each (`x`, `y`) position, a bar starts where the previous trace's bar
  at that position ended, and the lowest bar of each stack starts at its own `base`. Heights add
  up as they are, so a negative height goes down from the top of the bar below it. Bars at the
  same position that are not in one group overlap.
- **Axis ranges** include every bar's whole footprint on x and y, and every bar's bottom and top
  on z, so the base (0 by default) and the stack totals are in range.
- **Log z axes.** Bottoms and tops are placed on the log axis; a bottom at or below zero (the
  default `base: 0`) starts at the bottom of the axis range.
- **Scene.** `scene: 'scene2'` puts the trace in another scene (default `'scene'`).

## Variations

<ChartVariations />

### A numeric grid

Bars on numeric axes sit at their `x`, `y` values: here a bivariate histogram of 2,000 samples,
counted on a 12 × 12 grid of 0.5-wide bins. `width` and `depth` are set to 0.45 (in axis units)
instead of the default 0.4 (0.8 of the 0.5 spacing); empty bins draw nothing.

<ExampleLink id="bar3d/numeric-grid" />

### Stacked bars

Three traces (fossil, nuclear and renewable generation) share `stackgroup: 'mix'`, so at every
country and year each source starts where the one before it ended. The z axis covers the stack
totals, and hovering a block shows its own value and where it starts (`base`).

<ExampleLink id="bar3d/stacked" />

### Colored by height

With a `marker.colorscale` and no `marker.color` array, the bars are colored by `z`. Here monthly
temperature anomalies over ten years through a diverging scale centered on zero (`cmid: 0`), with
a colorbar; negative anomalies go down from 0.

<ExampleLink id="bar3d/colorscale" />

### Materials and translucency

The same bars three times: Plotly's lighting model (the default); a three.js `standard` material
(`metalness`, `roughness`) lit by the scene's light rig (`scene2.lighting`); and translucent bars
(`opacity: 0.55`) without edges.

<ExampleLink id="bar3d/materials" />

## Styling

- **Colors.** `marker.color` is one CSS color, or one per bar: colors, or numbers mapped through
  `marker.colorscale`, `cmin`, `cmax`, `cmid` and `reversescale`, with `showscale` and `colorbar`
  for a colorbar, or `marker.coloraxis` to share a scale between traces. When a colorscale is asked
  for (`colorscale`, `cmin` / `cmax`, `showscale`, `colorbar` or `coloraxis`) without a color
  array, the bars are colored by their height `z`. Without either, each trace takes the next
  colorway color. See [colors and colorscales](/fundamentals/colors-colorscales).
- **Opacity.** `marker.opacity` (times the trace `opacity`) below 1 draws the bars translucent:
  front faces only, without depth writes, sorted back to front by box center whenever the view
  changes.
- **Edges.** `marker.line.color` and `marker.line.width` (CSS px, default `#444` and 1) draw the
  box edges inside the faces, at the same px width at any depth: half the width on each of the two
  faces that meet at an edge, so edges never flicker against the faces. `width: 0` turns them off.
- **Lighting.** `lighting.{ambient, diffuse, specular, roughness, fresnel}` (defaults 0.55, 0.6,
  0.08, 0.5 and 0.2: more contrast between the top, front and side faces than `mesh3d`'s defaults)
  and `lightposition.{x, y, z}` (default 1e5, 1e5, 0), as in Plotly's meshes.
- **Default look.** The default `holochart` template draws 1 px edges in the background color and
  slims the colorbar. `template: 'plotly-classic'` (or `'none'`) keeps the `#444` edges
  ([themes and templates](/customization/themes-templates)).
- **Legend.** Each trace shows a bar glyph in its color (the middle of its colorscale when colored
  per bar); clicking an entry toggles the trace.

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'bar3d',
      x: [0, 1, 2, 0, 1, 2],
      y: [0, 0, 0, 1, 1, 1],
      z: [4, 7, 3, 5, 2, 6],
      base: 1,
      width: 0.6,
      depth: 0.6,
      marker: {
        color: ['#4c78a8', '#4c78a8', '#4c78a8', '#f58518', '#f58518', '#f58518'],
        opacity: 0.9,
        line: { color: '#ffffff', width: 2 },
      },
      lighting: { ambient: 0.4, diffuse: 0.8 },
    },
  ],
});
```

## Interactivity

- **Camera.** Drag to turn the scene, scroll or pinch to zoom, double-click to go back to the
  first view; see the [scene controls](/fundamentals/3d-scenes#controls).
- **Hover.** Bars are picked on the GPU, so the bar you hover is the one you see. The label sits at
  the center of the bar's top (its lower end, for negative heights) and shows, per `hoverinfo`
  (default all of `x+y+z+base+text+name`), the position (`x: …`, `y: …`, categories by name), the
  height (`z: …`: the bar's own value, not the top of its stack), `base: …` when the bar does not
  start at 0 (its `base`, or the top of the bar below it in a stack), then its `text`. Values are
  formatted like the scene axes, or by `xhoverformat`, `yhoverformat` and `zhoverformat`; on a log
  z axis, heights and bases are shown as plain numbers. `hovertemplate` can use `%{base}` and
  `%{top}` (the bar's ends on the z axis) besides `%{x}`, `%{y}`, `%{z}`, `%{text}` and
  `%{customdata}`:

  ```ts
  import { createChart } from '@mk7s/holochart';

  createChart(document.getElementById('chart')!, {
    data: [
      {
        type: 'bar3d',
        name: 'Q1',
        stackgroup: 'q',
        x: ['north', 'south'],
        y: ['2025', '2025'],
        z: [12, 9],
      },
      {
        type: 'bar3d',
        name: 'Q2',
        stackgroup: 'q',
        x: ['north', 'south'],
        y: ['2025', '2025'],
        z: [15, 11],
        hovertemplate: '%{x}: %{z} (%{base} → %{top})<extra></extra>',
      },
    ],
  });
  ```

- **Events.** `hover` and `click` points carry `x`, `y`, `z` (the height), `curveNumber`,
  `pointNumber` and `customdata`, plus `base` and `top`:

  ```ts
  import { createChart } from '@mk7s/holochart';

  const chart = createChart(document.getElementById('chart')!, {
    data: [{ type: 'bar3d', x: ['a', 'b'], y: ['p', 'p'], z: [3, 5] }],
  });
  chart.on('click', (e) => {
    const p = e.points[0];
    if (p) console.log(p.pointNumber, p.x, p.y, p.z);
  });
  ```

- **Spikes and annotations** work as for every 3D trace: see [spikes](/fundamentals/3d-scenes#spikes)
  and [annotations](/fundamentals/3d-scenes#annotations).

## 3D-native options

- **Materials.** `material.type` swaps Plotly's lighting model: `'plotly'` (the default), `'flat'`
  (unlit colors), or a three.js material type (`'standard'`, `'physical'`, `'phong'`,
  `'lambert'`, `'toon'`, `'matcap'`, `'basic'`) with its parameters (`metalness`, `roughness`,
  `clearcoat`, …). The three.js types are lit by the scene's light rig (`scene.lighting`) and
  receive its shadows with `material.receiveshadow`; bars cast none (`castshadow` is ignored). See
  [materials and lighting](/customization/materials-lighting#material-types-trace-material).
- **Camera tours and auto-rotation.**
  [`chart.animateCamera`](/fundamentals/3d-scenes#camera-animation) flies the camera to a new
  view, and [`scene.autorotate`](/fundamentals/3d-scenes#auto-rotation) turns the scene like a
  turntable.

## Performance notes

- Every bar of a trace is one instance of a single 24-vertex box (6 faces of 4 vertices with their
  own normals, 36 indices) in one instanced draw call, with 11 floats per bar (its min corner, its
  size, its color and its index for picking). No geometry is built on the CPU, and orbiting only
  moves the camera, so tens of thousands of bars stay interactive.
- Bar corners are stored relative to an origin in 32-bit floats (the origin in 64-bit), so
  date axes and large coordinates keep their precision.
- Edges cost nothing extra: they are drawn by the faces' fragment shader, not as lines.
- Translucent bars are re-sorted, and their instance data rewritten, whenever the view changes;
  keep `opacity: 1` for the largest traces.
- The shaders come from the lazily loaded mesh chunk that `mesh3d` uses too; the bars appear once
  it has loaded (`chart.ready` waits for it).

## Accessibility notes

- **Screen readers:** the chart is a `<canvas>`; the hidden description (see the
  [accessibility guide](/guides/accessibility)) names the trace.
- **Keyboard:** Shift + arrow keys orbit the camera, `+` / `-` move it in and out and `0` resets it.
  There is no keyboard navigation between the trace's own points yet. See [the keys by chart
  family](/guides/accessibility#keys-by-chart-family).
- **Color and depth:** nearer bars hide farther ones, and perspective distorts heights. Set an
  initial `scene.camera` that shows every row, keep the values in hover labels, and prefer a
  lightness-monotonic colorscale when coloring by height. For exact comparisons, offer a
  [heatmap](/charts/scientific/heatmap) of the same matrix as well.

## Attribute reference

See the [bar3d attribute reference](/reference/bar3d) for every attribute, its type, and its
default. Scene attributes (camera, axes, lights) are under [`scene`](/reference/layout#scene), and
shared color axes under [`coloraxis`](/reference/layout#coloraxis), in the layout reference.

## Related charts

- [Bar chart](/charts/basic/bar): bars on a flat plot, grouped or stacked with `barmode`
- [Heatmap](/charts/scientific/heatmap): the same matrix as colored cells, easier to compare
- [3D mesh](/charts/3d/mesh3d): arbitrary triangle meshes in the same scenes and lighting
- [3D scenes](/fundamentals/3d-scenes): cameras, axes and controls of every 3D trace

## Plotly migration notes

- `bar3d` is a Holochart extension: Plotly has no 3D bar trace, and a Plotly figure with
  `type: 'bar3d'` does not render in Plotly. In Plotly, 3D bars are usually built as `mesh3d`
  boxes (8 vertices and 12 triangles per bar); such figures still work in Holochart, and a
  `bar3d` trace replaces them with `x`, `y`, `z` and one draw call.
- Names follow Plotly's conventions: `x`, `y`, `base`, `width`, `marker.color` and the colorscale
  attributes, `marker.opacity`, `marker.line` and `stackgroup` as in 2D bars and scatter;
  `lighting`, `lightposition` and the hover attributes as in `mesh3d`. `depth` is the footprint
  along y, and `z` holds the heights (2D bars keep them in `y`).
- **Stacking is per trace.** Scenes have no `barmode`, so `stackgroup` (like scatter's) chooses
  which traces stack: it is the equivalent of Plotly's `barmode: 'stack'` for the traces that
  share a group, and several groups can stack independently in one scene. There is no grouped
  mode: bars at the same position overlap unless you offset their `x` or `y` and narrow their
  `width` or `depth`. There is no `barnorm` or `'relative'` stacking.
- Not supported: text drawn on the bars (`texttemplate`, `textposition`), `offset`, per-bar
  `marker.line` styles, and patterns. The `castshadow` flag of `material` is ignored.
