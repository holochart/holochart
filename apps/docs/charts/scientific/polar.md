---
title: Polar & radar
description: Markers, lines and filled shapes at polar coordinates (r, θ), for directional and cyclic data and radar charts.
status: complete
chart: scatterpolar
launch-featured: true
---

# Polar & radar

<ChartOverview />

## Overview

A polar chart places each point by a distance from the center (`r`) and an angle (`theta`). Use
one when the angle means something: a direction (wind, bearing, antenna gain), a phase or a time
of day, month or year that wraps around. Spirals, rose curves and other curves defined in polar
form also read naturally on it.

The `scatterpolar` trace is the polar twin of [scatter](/charts/basic/scatter): markers, lines,
text and filled areas, with the same `mode`, `marker`, `line` and `text` attributes. With a
category angular axis and `fill: 'toself'` it draws **radar charts** (spider charts), which
compare a few items over several named measures.

Traces are drawn on a **polar subplot**, `layout.polar` (and `polar2`, `polar3`, … for more),
which holds the radial and angular axes, the sector, the hole and the background.

Pick a different chart when:

- the values are amounts per direction or per period, to be compared by area or stacked: use
  [polar bars](/charts/scientific/barpolar) (wind roses);
- the angle is not cyclic: a [line](/charts/basic/line) or [bar](/charts/basic/bar) chart on
  cartesian axes is easier to read, because lengths along a straight axis compare better than
  radii;
- a radar chart has many measures or many items: radar charts get cluttered fast, and a
  [parallel coordinates](/charts/statistical/parallel-coordinates) chart or a grouped bar chart
  scales better. The order of the measures also changes the shape, and so what readers see.

## Minimal example

The figure sketch below shows the essential data shape. Open **Complete source** on the live
example for a runnable module with setup, dependencies and cleanup.

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [{ type: 'scatterpolar', r: [1, 2, 3, 2.5, 1.5], theta: [0, 45, 90, 180, 270] }],
});
```

`r` is the distance from the center and `theta` the angle, in degrees counterclockwise from 3
o'clock by default. The trace goes on `layout.polar`, which is created for it. As on cartesian
axes, the default `mode` is `'lines+markers'` for up to 20 points and `'markers'` above. The
radial axis autoranges from zero (`rangemode: 'tozero'`) and is drawn along the first angle of the
sector. The live example draws a marker cloud and a lines-and-markers spiral:

<Example id="polar/basic" />

## Data format

- **`r` and `theta`.** Arrays (plain or typed) of the same length; with different lengths the
  shorter one wins. Without `theta`, the angles start at `theta0` and step by `dtheta` (by
  default a full turn divided by the number of points, so the points go once around). Without
  `r`, the radii start at `r0` and step by `dr`. A trace with neither is hidden.
- **Angle units.** On a numeric angular axis, `theta` is in the trace's `thetaunit`:
  `'degrees'` (default), `'radians'` or `'gradians'`. Traces with different units can share a
  subplot. `angularaxis.thetaunit` (`'degrees'` or `'radians'`) only sets how the axis labels and
  hover values read.
- **Category angles.** When `theta` holds strings, the angular axis is a category axis
  (`angularaxis.type: 'category'`, detected from the first trace on the subplot): categories are
  spread evenly around the circle, `angularaxis.period` positions per turn (default: the number
  of categories). `categoryorder` and `categoryarray` reorder them. A radar trace repeats its
  first point at the end to close the shape.
- **Radial values.** The radial axis can be `linear`, `log`, `date` or `category`, detected from
  `r` like a cartesian axis. On a log axis, give plain values; zero and negative values are left
  out.
- **Missing values.** A point whose `r` or `theta` is not a number (`null`, `NaN`) breaks the line
  there, unless `connectgaps: true`.
- **Points outside the view.** Radii below the radial range sit on its inner edge (the center, or
  the edge of the hole); radii beyond it, and angles outside a partial `sector`, fall outside the
  subplot. Lines and fills are clipped to the subplot, and markers outside it are hidden, as in
  Plotly.

```ts
import { createChart } from '@mk7s/holochart';

// Hourly counts: theta from theta0 / dtheta (24 hours, 15° apart) on a clockwise clock face.
createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'scatterpolar',
      r: [3, 2, 1, 1, 2, 5, 9, 14, 12, 10, 9, 11, 12, 10, 9, 10, 13, 15, 12, 9, 7, 6, 5, 4],
      theta0: 0,
      dtheta: 15,
      fill: 'toself',
    },
  ],
  layout: { polar: { angularaxis: { direction: 'clockwise' } } },
});
```

## Variations

<ChartVariations />

### Radar charts

`fill: 'toself'` closes each trace into a filled shape. With category angles, that is a radar
chart; setting `radialaxis.range` gives every item the same scale, which radar charts need to be
compared:

<ExampleLink id="polar/radar" />

### Polygon grid

`polar.gridshape: 'linear'` draws the radial grid and the outer line as polygons through the
category angles, the classic radar look (category angular axes only). The radial axis snaps to
the nearest vertex, and fills follow straight edges between the axes. Here with a clockwise
angular axis and a fixed `range` and `dtick`:

<ExampleLink id="polar/gridshape" />

### Splines and radians

`line.shape: 'spline'` smooths the line through the points (a Catmull-Rom spline in screen space,
tuned by `line.smoothing`, as in Plotly); `'linear'`, the default, draws straight segments. The
traces here give `theta` in radians (`thetaunit: 'radians'`), and `angularaxis.thetaunit` labels
the axis in radians too:

<ExampleLink id="polar/spline" />

### Sectors and holes

`polar.sector: [start, end]` keeps part of the circle (in degrees), and the subplot grows to fill
its domain; `polar.hole` cuts out the middle as a fraction of the radius. The radial range starts
at the hole's edge. Lines are clipped where they leave the range or the sector:

<ExampleLink id="polar/sector-hole" />

### Several subplots and a log radial axis

Each trace picks its subplot with `subplot: 'polar2'`, and each `layout.polarN` has its own
`domain`, axes and background. Without a `domain`, subplots sit side by side. On the left, a log
radial axis turns exponential growth into an even spiral:

<ExampleLink id="polar/subplots" />

## Styling

- **Markers, lines and text.** The same attributes as scatter: `marker` (`symbol`, `size`,
  `color` with colorscales and a colorbar, `line`, `opacity`), `line` (`color`, `width`, `dash`,
  `shape`, `smoothing`), `text`, `texttemplate`, `textposition` and `textfont`. See the
  [scatter page](/charts/basic/scatter#styling).
- **Fills.** `fill: 'toself'` fills each run of the line between gaps; `'tonext'` fills the ring
  between this trace and the previous `scatterpolar` trace on the same subplot (one should
  enclose the other), and acts like `'toself'` for the first one. `fillcolor` defaults to the line
  color, half transparent.
- **Clipping.** `cliponaxis: true` also clips markers and text to the subplot outline (by default
  they are drawn whole, and those outside the subplot are hidden).
- **Subplot.** `polar.bgcolor`, `sector`, `hole`, `gridshape` and `domain`.
- **Angular axis.** `direction` (`'counterclockwise'` or `'clockwise'`), `rotation` (where 0
  sits: 0°, east, by default; 90°, north, with `direction: 'clockwise'`, like a compass),
  `thetaunit`, `period`, and the usual tick, line and grid attributes (`dtick`, `tickvals`,
  `ticktext`, `tickformat`, `showgrid`, `gridcolor`, `griddash`, `linecolor`, …).
- **Radial axis.** `type`, `range`, `autorange`, `rangemode` (`'tozero'` by default, or
  `'nonnegative'`, `'normal'`), `angle` (the direction the axis is drawn along; default: the first
  `sector` angle), `side` (which side of the axis line the labels go), `title`, and the tick, line
  and grid attributes.
- **Default look.** The default `holochart` template gives polar subplots the plot background and
  the axis style of the cartesian axes, with a slightly brighter grid, and draws scatterpolar
  lines and markers like scatter's. `layout.template: 'plotly-classic'` renders Plotly's
  defaults, and the plotly.py themes (`plotly_dark`, `ggplot2`, …) style polar subplots as they do
  in Python. See [themes and templates](/customization/themes-templates).

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'scatterpolar',
      r: [3, 4, 2, 5, 3],
      theta: ['A', 'B', 'C', 'D', 'E'],
      mode: 'lines+markers',
      marker: { symbol: 'diamond', size: 8 },
      line: { dash: 'dot', width: 2 },
    },
  ],
  layout: {
    polar: {
      bgcolor: '#101018',
      angularaxis: { direction: 'clockwise', gridcolor: '#333' },
      radialaxis: { range: [0, 6], angle: 90, tickfont: { size: 10 }, title: { text: 'Score' } },
    },
  },
});
```

## Interactivity

- **Hover.** The closest point shows `r: …` and `θ: …`, formatted like the axes (degrees with
  `°`, radians or the category name), then `text` or `hovertext`. `hoverinfo` takes the flags
  `r`, `theta`, `text` and `name`, and `hovertemplate` takes `%{r}`, `%{theta}`, `%{text}` and
  `%{customdata}`. With `hoveron` including `'fills'`, hovering inside a filled area shows the
  trace's name or text. Points outside the subplot don't hover.

  ```ts
  import { createChart } from '@mk7s/holochart';

  createChart(document.getElementById('chart')!, {
    data: [
      {
        type: 'scatterpolar',
        r: [12, 18, 9],
        theta: ['N', 'E', 'S'],
        hovertemplate: '%{theta}: %{r} km/h<extra></extra>',
      },
    ],
  });
  ```

- **Radial range.** Drag the handle just past the outer end of the radial axis along the axis to
  move the end of the radial range; drag it across the axis to turn the radial axis
  (`radialaxis.angle`). With a hole or a partial sector, a second handle at the inner end moves
  the start of the range.
- **Rotation.** Drag in the band about 30 px wide just outside the circle to rotate the angular
  axis (`angularaxis.rotation`).
- **Zoom.** With `dragmode: 'zoom'`, drag in the plot area: the ring between the radius where you
  pressed and the pointer's radius becomes the radial range. A double-click in the plot area
  (with `dragmode` `'zoom'` or `'pan'`) goes back to the first view.
- **Events.** Drags emit `relayouting` while they move and one `relayout` when they end, with
  Plotly's keys: `polar.radialaxis.range`, `polar.radialaxis.range[1]`,
  `polar.radialaxis.angle` and `polar.angularaxis.rotation` (`polar2.…` for other subplots).
  Setting a range (or one end of it) with `relayout` turns the axis' `autorange` off, as on
  cartesian axes. `hover` and `click` points carry `r`, `theta` and `pointNumber`:

  ```ts
  chart.on('relayout', (update) => console.log(update['polar.radialaxis.range[1]']));
  chart.on('click', (e) => console.log(e.points[0]?.pointNumber));
  ```

- **Selection.** With `dragmode: 'select'` or `'lasso'`, drag in the plot area to select the
  markers inside the box or lasso (the box stays within the subplot's bounding box); hold Shift
  to add to the selection, double-click to clear it. Points outside the radial range or sector
  aren't selectable, and traces without markers or text select nothing, as in Plotly.
  `selected` / `unselected` style the points, `selectedpoints` holds the selection, and
  `selecting` / `selected` points carry `r` and `theta`:

  ```ts
  chart.on('selected', (e) => console.log(e.points.map((p) => [p.r, p.theta])));
  ```

  As in Plotly, polar selections aren't stored in `layout.selections`.

- **Transitions.** `animate` and transitions update polar traces without interpolating between
  frames, as in Plotly.

## Performance notes

- Markers and text are scatter's own GPU-instanced markers and text, so marker styles cost the
  same as on cartesian axes.
- Polar positions are computed in pixels on the CPU, for the current radial range and rotation.
  Drags redraw the traces from the subplot without re-running the figure pipeline, but each step
  re-projects the points and re-clips the lines and fills, so the cost grows with the number of
  points. Keep very long lines on cartesian axes.
- Spline lines are shaped on the CPU too, and cost more than straight segments.
- With `@mk7s/holochart-runtime` and your own module list, register `scatterpolar` with
  `polarComponent` (which draws the axes and runs the drags); `sciTraces` includes both. See the
  [performance guide](/guides/performance).

## Accessibility notes

- **Screen readers:** the chart is a `<canvas>`; the hidden description (see the
  [accessibility guide](/guides/accessibility)) reads each trace by its kind (radar for filled
  traces, polar line or polar scatter) with its point count and where `r` is lowest and highest
  (with the angle, formatted like the hover labels). Its data table lists the points' `r` and `θ`
  (and `text` when given per point).
- **Keyboard:** Tab moves into the plot area; the arrow keys then step through the points, each
  showing its hover label. See [the keys by chart
  family](/guides/accessibility#keys-by-chart-family). The script-tag build leaves these stops out
  for now.
- **Reading the chart:** radar shapes are easy to misjudge: area grows with the square of the
  radius, and the order of the measures changes the shape. Keep the radial range fixed and
  starting at zero, and label the measures with their names.
- **Color:** give filled radar traces transparent fills (the default) so overlaps stay visible,
  and tell traces apart by line dash or marker symbol as well as by color.

## Attribute reference

See the [scatterpolar attribute reference](/reference/scatterpolar) for every trace attribute,
its type and its default. The subplot is under [`polar`](/reference/layout#polar) in the layout
reference: [`sector`](/reference/layout#polar.sector), [`hole`](/reference/layout#polar.hole),
[`gridshape`](/reference/layout#polar.gridshape),
[`radialaxis`](/reference/layout#polar.radialaxis) and
[`angularaxis`](/reference/layout#polar.angularaxis).

## Related charts

- [Polar bars](/charts/scientific/barpolar): bars on the same polar subplots (wind roses), which
  can share a subplot with scatterpolar traces
- [Scatter](/charts/basic/scatter) and [line](/charts/basic/line): the cartesian twins of this
  trace
- [Parallel coordinates](/charts/statistical/parallel-coordinates): many measures of many items,
  where radar charts get crowded
- [Layout, axes & subplots](/fundamentals/layout-axes-subplots#polar-subplots): placing polar
  subplots next to cartesian ones

## Plotly migration notes

- Attribute names and defaults match Plotly's `scatterpolar`: `r`, `theta`, `r0` / `dr`,
  `theta0` / `dtheta`, `thetaunit`, `subplot`, the scatter modes, markers, lines, text and fills,
  and the `layout.polar` subplot with its axes. There is no separate `scatterpolargl` trace:
  change the type to `scatterpolar`, whose markers are drawn on the GPU already.
- Lines are shaped like Plotly's: splines are Catmull-Rom curves in screen space, and straight
  segments are chords between the points (not arcs), so a two-point line at the same radius cuts
  across the circle.
- `thetaunit: 'gradians'` converts gradians (400 per turn); plotly.js reads them as radians.
- Transitions don't interpolate polar traces; Plotly doesn't either.
- Selection events have no `range` / `lassoPoints` for polar subplots (Plotly reports them in
  its internal pixel axes), and the box or lasso outline goes away when the drag ends.
- Not supported yet: `line.backoff`, `marker.gradient` and `fillpattern`.
