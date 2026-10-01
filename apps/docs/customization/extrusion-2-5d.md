---
title: Extrusion & 2.5D
description: Give bars physical depth with rounded edges and lighting, and show any 2D subplot in perspective with layout.view3d, with axes, hover, zoom and selection still working.
status: draft
---

# Extrusion & 2.5D

Two Holochart extensions turn 2D charts into 3D-styled ones without leaving the 2D model:

- **`depth`** extrudes a trace's shapes toward the viewer, as lit prisms with optional rounded
  edges (`bevel`) and a `material`: bars, funnels, waterfalls, heatmap cells (as columns as tall
  as their values), filled areas, and pies, treemaps and icicles, which also tilt on their own
  (`tilt`; see [below](#pies-treemaps-and-icicles-depth-and-tilt)).
- **`layout.view3d`** shows every cartesian subplot in perspective: the plot area becomes a plane
  in 3D, tilted and turned. Axes, grid lines, tick labels, hover, click, zoom, pan and selection
  keep working on that plane.

<Example id="bar/depth" />

::: info Status
M6 wave 3: `depth`, `bevel` and `material` on `bar`; `layout.view3d` for cartesian subplots, with
animated transitions and turning drags; `depth`, `bevel`, `material`, `tilt` and `perspective` on
`pie`, `treemap` and `icicle`; `depth` on `funnel`, `waterfall`, `heatmap` (cells as columns) and
filled `scatter` traces (areas). 2.5D is part of the full bundle (`@mk7s/holochart`), like 3D: the smaller
`basic` bundle (runtime, components, basic traces) doesn't include it (see
[Bundles](#bundles-and-script-tags)).
:::

## Extruded bars: `depth`

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'bar',
      x: ['Mon', 'Tue', 'Wed', 'Thu'],
      y: [12, 18, 7, 21],
      depth: '60%',
      bevel: { size: 4 },
    },
  ],
  layout: { view3d: { enabled: true, tilt: 20, rotation: -25 } },
});
```

| Attribute        | Default  | What it does                                                                                                                                                                                                                                            |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `depth`          | `0`      | How far the bars stand out of the plot plane toward the viewer: CSS px (`24`), a percentage of each bar's width along its position axis (`'60%'`, `'100%'` for square columns), or one number per bar (px). `0` draws flat bars, exactly as without it. |
| `bevel.size`     | `0`      | Radius of the rounded front and side edges, px (at most half the bar's size and its depth).                                                                                                                                                             |
| `bevel.segments` | `3`      | Segments of each rounded edge (1–16).                                                                                                                                                                                                                   |
| `material`       | `plotly` | How the prisms are shaded: Plotly's lighting model, `flat` (unlit), or a three.js material type with its parameters (see [Materials & lighting](/customization/materials-lighting)).                                                                    |

Every bar mode works: grouped, stacked (each segment is its own prism), `relative`, overlaid,
horizontal bars (`orientation: 'h'`), negative values and a `base`. Bars are clipped to the plot
area at the axis ranges when you zoom or pan, at any height.

<Example id="bar/depth-stacked" />

<Example id="bar/depth-horizontal" />

Bar labels (`text`) and error bars move to the front faces. Outlines (`marker.line`), corner
radii and hatch patterns are not drawn on extruded bars.

### In the flat view

Without `layout.view3d`, extruded bars are seen straight on: their front faces show their color
exactly, and bevels shade the rounded edges like buttons. The prisms stand in front of the plot
plane, so other traces drawn after them on the plane (a line through the bars, say) pass behind
them.

<Example id="bar/depth-bevel" />

### Lighting and materials

Extruded shapes are lit by a light fixed to the chart, from the upper left in front, plus
ambient light. With Plotly's model (the default `material`), a face turned toward the viewer shows
its color exactly; tops are a little darker, sides darker still, so the shapes read as 3D
whatever the view. `material.type` switches to `flat` (unlit) or a three.js material
(`standard`, `physical`, `phong`, `toon`, …) lit by the same lights:

<Example id="bar/depth-materials" />

## Funnels and waterfalls

`funnel` and `waterfall` take `depth`, `bevel` and `material` exactly as bars do (they are drawn
by bar's renderer): `depth` in px, a percentage of the bar width (`'70%'`; for a horizontal funnel,
of the stage thickness) or one number per stage or step.

<Example id="funnel/depth" />

Their connectors lie on the plane of the front faces, where the eye follows them from one front
to the next: a funnel's connector regions and their outlines join the fronts of consecutive stages,
so the funnel reads as one continuous shape, and a waterfall's connector lines (`between` or
`spanning`) run along the fronts of the bar ends. Labels sit on the front faces, as for bars; hover
and click are exact on the prisms.

<Example id="waterfall/depth" />

## Heatmaps: cells as columns

For a heatmap, extrusion encodes the value: with `depth`, every cell stands up as a column as tall
as its value, like a 3D histogram or a city seen from above.

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'heatmap',
      z: [
        [1, 4, 2],
        [3, 8, 5],
        [2, 6, 9],
      ],
      depth: 120,
      xgap: 3,
      ygap: 3,
    },
  ],
  layout: { view3d: { enabled: true, tilt: 40, rotation: -30 } },
});
```

| Attribute  | Default  | What it does                                                                                                                                                                                                                 |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `depth`    | `0`      | Height in px of a column at `zmax` (or a percentage of the mean cell width, `'300%'`). Heights grow linearly from 0 — from `zmin` when the color range has negative values — and values outside the color range are clamped. |
| `bevel`    | —        | Rounded edges, as for bars (grids of up to 10,000 cells; larger ones get sharp edges).                                                                                                                                       |
| `material` | `plotly` | As for bars.                                                                                                                                                                                                                 |

Each column takes its cell's color (the colorscale at its value, as the flat cell), `xgap` and
`ygap` space the columns, and cells without a value have none. The flat heatmap stays drawn under
the columns as their floor, so cells at the bottom of the range keep their color; cell labels
(`texttemplate`) move in front of the columns. The pointer picks the column under it, its top or a
side.

<Example id="heatmap/columns-city" />

All columns are one merged mesh, one draw call. Building them is linear in the cells: about 0.2 s
for 200 × 200 (40,000 columns), again on each zoom step since the gaps and bevels are in px; pans
only move them. Grids of more than 100,000 cells stay flat, with one console warning.

<Example id="heatmap/columns-terrain" />

## Areas: fills with depth

On a scatter trace with a fill (`fill: 'tozeroy' | 'tozerox' | 'tonexty' | 'tonextx' | 'toself' |
'tonext'`), `depth` turns the fill into a slab that many px thick (or a percentage of the plot
area's width); the line, markers, labels and error bars are drawn on its front face.

<Example id="area/depth" />

- **Stacked areas** (`stackgroup`, or `tonexty` fills) form one slab in layers: every filled
  trace uses the same depth range, so the layers sit side by side, each lit on its front face and
  its top wall. Overlapping fills that aren't stacked share the depth range too; later traces'
  front faces sit a fraction of a px in front, so they never flicker.
- **The slab is exactly the flat fill**: its front face is the fill's own triangulation, so holes
  and self-intersecting `toself` shapes filled by the nonzero rule come out as in the flat view,
  and its walls stand only on the outline of the filled region.
- The slab takes `fillcolor` (translucent fills stay translucent); `fillgradient` and `fillpattern`
  are drawn flat, and `bevel` doesn't apply to fills.
- Hover is exact on the front face, on the walls, and a few px around the front face (where the
  line and markers along the fill's edge are drawn).

<Example id="area/depth-stacked" />

<Example id="area/depth-toself" />

`depth` is defaulted (and listed in `fullData`) only for traces with a fill.

## The 2.5D view: `layout.view3d`

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [{ type: 'scatter', y: [3, 1, 4, 1, 5, 9, 2, 6] }],
  layout: { view3d: { enabled: true, tilt: 35, rotation: -15, perspective: 0.6 } },
});
```

| Attribute     | Default | What it does                                                                                        |
| ------------- | ------- | --------------------------------------------------------------------------------------------------- |
| `enabled`     | `false` | Show the cartesian subplots in perspective.                                                         |
| `tilt`        | `20`    | Elevation of the view, degrees (±80): positive looks from above, so the tops of vertical bars show. |
| `rotation`    | `-20`   | Azimuth, degrees (±80): positive looks from the right (right sides show), negative from the left.   |
| `perspective` | `0.5`   | Strength of the perspective, 0–1: 0 is a parallel projection; 1 a strong one (a 75° field of view). |
| `interactive` | `true`  | With `dragmode: 'turntable'` or `'orbit'`, dragging the plot area turns the view.                   |

`layout.view3d` applies to every cartesian subplot; each turns about the center of its own plot
area, and the tilted plane is shrunk just enough to stay inside it, so margins, legends and other
subplots stay where the flat view puts them. `tilt: 0, rotation: 0` draws the plot plane exactly
where the flat view does.

<Example id="view3d/scatter" />

What the view draws:

- **The plot area** as a plane (`plot_bgcolor`); flat traces, grid lines and shapes are clipped to
  it exactly as the flat view clips them to the rectangle.
- **Axes, ticks, tick labels and titles** lie in the plot plane, beside it. The axis whose labels go
  with extruded bars (their position axis: x for vertical bars) lies in the plane of the bars'
  front faces, so its labels sit below the bars rather than behind them; the value axis stays on
  the plot plane, next to its grid lines. Axes draw over the traces.
- **Markers and line widths** keep their size in px, as in 3D scenes.

### Hover, click, zoom, pan and selection

The pointer is mapped onto the plot plane — or onto the extruded shape under it (a bar, funnel
stage or waterfall step, a heatmap column, an area slab), front face, top or side — before the
chart's own handling. So everything works in data terms, as in the flat view:

- hover and click report the point or bar under the pointer, and hover labels appear where the
  tilted chart draws it;
- a zoom box and box or lasso selection cover the data inside the box as drawn on the plane (the
  outline is drawn in perspective);
- a pan moves the data under the pointer with it; scroll zoom zooms about the point under the
  pointer; double-click resets the axes.

The camera itself only changes with `tilt`, `rotation` and `perspective`.

### Turning the view

With `interactive` (the default) and `dragmode: 'turntable'` (or `'orbit'`), dragging the plot
area tilts (up and down) and turns (left and right) the view, within ±80°. The release commits the
new angles with one `relayout`, so they are in the figure and the `relayout` event. A press
without a drag still clicks what is under it.

<Example id="view3d/interactive" />

### Animated transitions

`animate` and `react` with a transition move `tilt`, `rotation` and `perspective` smoothly.
Turning `view3d.enabled` on or off animates too: the view turns from or to the flat view, since
`tilt` and `rotation` 0 are the flat view. With frames, a pair of buttons switches back and forth:

```ts
import { createChart } from '@mk7s/holochart';

const chart = createChart(document.getElementById('chart')!, {
  data: [{ type: 'bar', y: [4, 5, 7, 6], depth: '70%' }],
  frames: [
    { name: 'flat', layout: { view3d: { enabled: false } } },
    { name: '3d', layout: { view3d: { enabled: true, tilt: 25, rotation: -30 } } },
  ],
});
await chart.animate(['3d'], {
  frame: { duration: 800, redraw: false },
  transition: { duration: 800, easing: 'cubic-in-out' },
});
```

<Example id="view3d/transition" />

`relayout` changes the view at once (like Plotly's `relayout`, it doesn't animate). Under
`prefers-reduced-motion` (or `config.a11y.reducedMotion`), transitions snap.

## Pies, treemaps and icicles: `depth` and `tilt`

Domain traces — `pie`, `treemap` and `icicle` — take `depth`, `bevel` and `material` too, and a
view of their own: `tilt` lays the trace back, like a pie on a table seen from the front, and
`perspective` sets how strongly the near side grows.

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'pie',
      labels: ['Housing', 'Food', 'Transport', 'Savings'],
      values: [1450, 620, 380, 540],
      depth: 36,
      tilt: 50,
    },
  ],
});
```

<Example id="pie/depth" />

| Attribute     | Default  | What it does                                                                                                                                                                                                                      |
| ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `depth`       | `0`      | Thickness toward the viewer: CSS px, a percentage of each shape's size (`'20%'`: of a slice's radius, of a tile's smaller side), or one number per item (per `labels` entry: a slice, a tile's node) for "height-encoded" charts. |
| `tilt`        | `0`      | Degrees (±80): positive lays the trace back so its near (bottom) edge comes forward and the fronts of its prisms show; `0` is the flat view, and with `depth` the shapes are seen from the front.                                 |
| `perspective` | `0.5`    | 0 (a parallel projection, the classic 3D-pie look) to 1 (strong).                                                                                                                                                                 |
| `bevel`       | —        | Rounded edges, as for bars.                                                                                                                                                                                                       |
| `material`    | `plotly` | As for bars. Faces toward the trace's own normal (slice and tile tops) show their exact color at any tilt.                                                                                                                        |

### Why a view of their own

`layout.view3d` tilts cartesian subplots, whose plot area, axes, grid, zoom and selection all move
together. Domain traces have none of that: each sits in its own `domain`, beside legends, titles and
other domain traces. So each takes its own `tilt`, with its domain rect as the tilted plane
(`tilt: 0` draws exactly where the flat trace is): a dashboard can mix a flat donut and a tilted
pie, and the view is part of the trace, so it animates like any trace attribute. There is no
azimuth: a pie turns with its own `rotation`, and tiles read best square on. `layout.view3d`
doesn't change domain traces.

### What they draw

- **Slices** are sectors (annular sectors for a donut's `hole`), each standing on the table; a
  pulled slice (`pull`) moves out along its bisector in 3D. **Tiles** are boxes, and a treemap tile
  stands on its parent's top, so the hierarchy rises in terraces, one per level; icicle cells stand
  side by side.
- **Labels** — inside and outside, the pie's leader lines, a treemap's path bar — lie on the tops of
  the shapes they belong to, upright and at their own size; outside labels in front of a pie sit at
  its foot, clear of the slices' fronts. A shape in front of a label hides it.
- **Outlines** (`marker.line`) become gaps of the line's width between the slices or tiles.
  Translucent colors (a leaf's `opacity`, `depthfade`, trace `opacity`) are drawn as the flat trace
  shows them, over the paper or the parent tile, so the prisms stay opaque.

<Example id="pie/depth-donut" />

<Example id="pie/depth-exploded" />

`depth` per slice encodes a second measure in the slices' heights, while the angles keep showing
the shares:

<Example id="pie/depth-height" />

<Example id="treemap/depth" />

<Example id="treemap/depth-height" />

<Example id="icicle/depth" />

### Hover, click and drill-down

The pointer is mapped onto the flat trace through the prism under it — a slice's top or front wall,
a tile's top — so hover and click report what is drawn under the pointer, hover labels appear where
the tilted trace draws their anchors, and keyboard focus follows. Treemap and icicle clicks drill
down as in the flat view; the tiles glide to their new places in 3D.

### Animated tilt

`tilt` and `perspective` are animatable, so `animate` and `react` with `layout.transition` move them
smoothly (`restyle` changes them at once):

<Example id="pie/depth-tilt" />

::: warning Reading a 3D pie
Pies are already hard to read precisely: we compare angles and areas less accurately than lengths.
Tilting one makes it worse. Perspective and foreshortening enlarge the slices in front and shrink
those at the back, so the same share looks bigger at the bottom than at the top, and the visible
front walls add area only to the front slices. Use a 3D pie for presentation, where the exact
shares are labelled (`textinfo: 'percent'`); for comparison, prefer a flat pie or, better, a bar
chart. A height-encoded pie shows a second measure, but heights are foreshortened too: label them,
and prefer `perspective: 0` so equal heights look equal.
:::

## Bundles and script tags

2.5D is part of the full bundle, `@mk7s/holochart`, which registers `bar`, `funnel`, `waterfall`,
`heatmap` and `scatter` (`extrudedScatter`, for fills) with `depth`, `bevel` and `material`, `pie`, `treemap` and `icicle` with those and `tilt` and `perspective`
(`extrudedPie`, `extrudedTreemap`, `extrudedIcicle`), and the `layout.view3d` component. Its code — the camera, the clipping, the prisms and
their lighting — loads the first time a chart turns the view on or draws a trace with `depth`; flat
charts never load it.

With script tags, that code is in the 3D add-on: load `holochart-3d.iife.min.js` after
`holochart.iife.min.js`. Without it, `depth` and `layout.view3d` are accepted and charts draw flat,
with one console warning that names the add-on.

A partial bundle opts in the same way the full bundle does:

<!-- docs-gates: no-typecheck -->

```ts
import { register } from '@mk7s/holochart-runtime';
import { withExtrusion } from '@mk7s/holochart-core';
import { extrudeRects } from '@mk7s/holochart-render';
import { bar, setBarExtruder } from '@mk7s/holochart-traces-basic';
import { view3dComponent } from '@mk7s/holochart';

setBarExtruder(extrudeRects);
register(withExtrusion(bar), view3dComponent);
```

## Good to know

- 2.5D is for presentation. Perspective distorts lengths and areas, and extruded bars hide parts of
  each other and of what lies behind them: for reading exact values, the flat view is better.
- `depth` accepts one number per bar ("height-encoded" bars need a scale you choose yourself).
- Not yet: per-subplot
  `view3d` settings (one setting for all cartesian subplots); shadows (`material.castshadow`) and
  custom lights in the 2.5D view; spike lines in the 2.5D view (hidden); a modebar button for the
  turning drag mode; outlines, corner radii and patterns on extruded bars; the common axis label of
  `hovermode: 'x'` follows the flat axis; layout shapes and images above the traces, annotations
  and custom hover labels (`config.renderHover`) are placed as in the flat view; with several
  subplots, a subplot's axes are drawn only when anchored to its own counter axis, and pointers
  outside every plot area map through the first subplot; per-cell heights for heatmap columns other
  than from `z`, and heatmap columns that zoom without a rebuild; staggered area slabs (a 3D area
  chart with series one behind the other); gradient and pattern fills on area slabs.
