---
title: Scatter
description: Plot x/y points as markers to show the relationship between two variables.
status: complete
chart: scatter
---

# Scatter

## Overview

A scatter plot draws one marker per data point at its x and y position. Use it to show the
relationship between two numeric variables, to spot clusters and outliers, or to plot many points
at once. Every scatter trace is drawn on the GPU, so there is no separate `scattergl` trace for
large data.

Scatter plots, [line charts](/charts/basic/line), and text labels all use the `scatter` trace
type. The `mode` attribute picks what is drawn: `'markers'`, `'lines'`, `'text'`, or a
combination such as `'lines+markers'`.

Pick a different chart when:

- the x values are ordered (time, sequence) and the trend matters more than single points: use a
  [line chart](/charts/basic/line);
- one axis is a list of categories and you compare amounts: use a [bar chart](/charts/basic/bar),
  or a dot plot (below) when the values don't start at zero.

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

const chart = createChart(document.getElementById('chart')!, {
  data: [{ type: 'scatter', mode: 'markers', x: [1, 2, 3, 4], y: [10, 15, 13, 17] }],
});
```

The chart fills its container, so give the element a size. Each trace takes the next color of the
colorway. The live example below has three traces with different symbols, sizes, and colors:

<Example id="_dev/chart-scatter-basic" />

## Data format

- `x` and `y`: the point coordinates. Plain arrays, typed arrays (`Float64Array`, `Float32Array`,
  ...), numbers, dates (`Date` objects or ISO strings such as `'2025-03-01'`), or category strings.
  The axis type (linear, date, category) is inferred from the values; set `xaxis.type` to override
  it.
- `x0`/`dx` and `y0`/`dy`: implicit coordinates when you leave out `x` or `y`. Point `i` is at
  `x0 + i * dx`.
- `text`, `customdata`, and `ids`: per-point extra data for labels, hover templates, and matching
  points across updates.
- A `null` or `NaN` in `x` or `y` leaves that point out (and breaks the line in `'lines'` mode).

See [Data formats](/fundamentals/data-formats) and
[Working with dates](/fundamentals/dates-time-series).

## Variations

### Modes and symbols

When you don't set `mode`, Holochart uses Plotly's rule: `'lines+markers'` for fewer than 20
points, `'lines'` otherwise. Set `mode: 'markers'` for a pure scatter plot. `marker.symbol` takes
one symbol or one per point, and `zorder` raises a trace above the others.

<Example id="scatter/basic" />

### Colorscales and bubbles

Pass numbers to `marker.color` to map them through `marker.colorscale` (`cmin`, `cmax`, `cmid`,
`reversescale`). Pass numbers to `marker.size` for a bubble chart; `sizemode: 'area'` makes the
marker area, not its diameter, proportional to the value. Set `marker.showscale: true` to draw a
colorbar; `marker.colorbar` takes the full axis tick API (`dtick`, `ticksuffix`, `tickformat`, …)
plus `title`, `orientation`, `thickness` and `len`. Traces that set the same `marker.coloraxis`
share one scale and one colorbar.

<Example id="scatter/colorscale" />

### Text labels

Add `'text'` to `mode` to label points. `textposition` places each label around its marker (one
value or one per point), and `texttemplate` formats it with the same syntax as `hovertemplate`.

<Example id="scatter/text-labels" />

### Error bars

`error_y` and `error_x` draw uncertainty per point: from data arrays (symmetric or asymmetric),
as a percentage, a constant, or the square root of the value.

<Example id="scatter/error-bars" />

### Dot plot

A Cleveland dot plot is two or more marker traces over categories. Put the categories on the y
axis so long labels stay readable.

<Example id="recipes/dot-plot" />

### Dumbbell

A dumbbell chart joins each pair of dots. All connectors are one `mode: 'lines'` trace whose
points go `[start, end, null]` per category; the `null` breaks the line between categories.

<Example id="recipes/dumbbell" />

### Lollipop

A lollipop is a marker on a stem from zero. The stem is a capless, one-sided error bar:
`error_y: { symmetric: false, array: zeros, arrayminus: values, width: 0 }`.

<Example id="recipes/lollipop" />

## Styling

- `mode`: `'markers'`, `'lines'`, `'text'`, a combination such as `'lines+markers'`, or `'none'`.
- `marker.symbol`: the marker shape, such as `'circle'`, `'square'`, `'diamond'`,
  `'triangle-up'`, or `'x'`, with `-open`, `-dot`, and `-open-dot` variants. See
  [Marker symbols](/reference/marker-symbols).
- `marker.size`: size in pixels, or one per point (bubbles), with `sizemode`, `sizeref`, and
  `sizemin`.
- `marker.color`: one color, one per point, or numbers mapped through `marker.colorscale`.
- `marker.opacity`, `marker.angle`, and `marker.line.color` / `marker.line.width` for the outline.
- `opacity` fades the whole trace; `zorder` changes the drawing order.
- `layout.colorway` sets the colors traces take in turn.

Most marker attributes accept per-point arrays. Values you don't set come from the
[template](/fundamentals/styling-themes).

## Interactivity

Hover, zoom, pan, and selection work on every scatter trace. Try them here: hover a point, drag to
zoom, double-click to reset, and use the modebar (top right, on hover) to switch to pan, box
select, or lasso.

<Example id="_dev/interaction-scatter" />

- **Hover.** `layout.hovermode` is `'closest'` by default. `'x'` and `'y'` show every trace at the
  hovered position, and `'x unified'` / `'y unified'` put them in one label. Change the label text
  with `hovertemplate`, for example `'%{x:.1f}, %{y:$,.2f}<extra></extra>'` (`<extra></extra>`
  hides the trace name box). `hoverinfo: 'skip'` turns hover off for a trace.
- **Zoom and pan.** `layout.dragmode` is `'zoom'` by default; set it to `'pan'`, `'select'`, or
  `'lasso'`. Double-click resets the axes. Wheel zoom is off for 2D plots unless you set
  `config: { scrollZoom: true }`.
- **Selection.** Box and lasso selection set `selectedpoints` and restyle points with
  `selected.marker.{color, opacity, size}` and `unselected.marker.*` (by default, unselected points
  fade to 20% opacity).
- **Events.** Listen with `chart.on('hover' | 'click' | 'selected' | 'relayout', ...)`. Each point
  in the payload has `curveNumber`, `pointNumber`, `x`, `y`, and `customdata`. See the
  [events reference](/reference/events).

```ts
chart.on('selected', (event) => {
  console.log(event.points.map((p) => p.pointNumber));
});
```

## Performance notes

- Markers are instanced on the GPU. In the M0 marker benchmark on an Apple M1 Max, 100,000
  markers drew their first frame in about 25 ms, and 1,000,000 markers of 3 px panned at over
  100 fps ([spike A](https://github.com/holochart/holochart/blob/main/docs/spikes/a-markers.md)).
  Larger markers cost more fill time (about half that frame rate at 8 px).
- Pass typed arrays (`Float64Array`) for large data. They are read without conversion.
- Style updates are cheap. `chart.restyle({ 'marker.color': 'crimson' })` only rewrites a color
  buffer; changing `x` or `y` recomputes the trace. See
  [Updating charts](/fundamentals/updating-charts).
- `marker.maxdisplayed` draws at most that many markers, evenly strided over the data.
- Text labels are typeset asynchronously, so thousands of labels take noticeably longer to appear
  than markers.
- `chart.extendTraces` / `prependTraces` stream points in: only the new points are converted and
  uploaded, and `maxPoints` keeps a rolling window. See [Line → Performance](/charts/basic/line#performance-notes).

## Accessibility notes

- **Screen readers:** a chart is a single `<canvas>`. The DOM mirror that describes traces and
  points to assistive technology is not built yet (planned for M2, see the
  [accessibility guide](/guides/accessibility)). Until then, add your own text alternative: an
  `aria-label` or visible caption on the container, and a data table for the key numbers.
- **Keyboard:** there is no keyboard navigation between points yet.
- **Color:** don't rely on color alone. Vary `marker.symbol` between traces, and pick a colorscale
  that is readable in grayscale (such as `'Viridis'`) for numeric colors.

## Attribute reference

See the [scatter attribute reference](/reference/scatter) for every attribute, its type, and its
default, for example [`marker.size`](/reference/scatter#marker.size) and
[`error_y`](/reference/scatter#error_y). Hover and drag settings are in the
[layout reference](/reference/layout#hovermode).

## Related charts

- [Line](/charts/basic/line): the same trace with `mode: 'lines'`, for ordered data
- [Bar](/charts/basic/bar): compare amounts across categories
- [Horizontal bar](/charts/basic/horizontal-bar): ranked categories with long labels

## Plotly migration notes

- `scatter` and `scattergl` are the same trace in Holochart. Rename `scattergl` to `scatter`.
- The default `mode` follows Plotly: `'lines+markers'` for fewer than 20 points, `'lines'`
  otherwise.
- Attribute names and the `hovertemplate` / `texttemplate` syntax match Plotly.
- Not supported yet: `fill` and `stackgroup` (area charts, M2), `marker.gradient`,
  `marker.angleref`, `marker.standoff`, `line.backoff`, and `hoveron`.
- Draw order matches Plotly: traces with a higher `zorder` draw on top; at equal `zorder`, bars
  draw below scatter traces whatever their order in `data`; then trace order.
