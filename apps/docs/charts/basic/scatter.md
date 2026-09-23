---
title: Scatter
description: Plot x/y points as markers to show the relationship between two variables.
status: draft
chart: scatter
---

# Scatter

## Overview

A scatter plot draws one marker per data point at its x and y position. Use it to show the
relationship between two numeric variables, to spot clusters and outliers, or to plot many
points at once. Every scatter trace is GPU-rendered, so there is no separate `scattergl` trace for
large data.

Scatter plots, [line charts](/charts/basic/line), and text labels are all the `scatter` trace type.
The `mode` attribute picks what is drawn.

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

createChart(el, {
  data: [{ type: 'scatter', x: [1, 2, 3, 4], y: [10, 15, 13, 17], mode: 'markers' }],
});
```

The live demo below is a placeholder. It shows the GPU marker primitive that scatter traces are
built on, not a full chart. It will be replaced by chart-level examples when the M1 runtime lands.

<Example id="_dev/markers-symbols" />

## Data format

- `x` and `y`: the point coordinates. Arrays, typed arrays (`Float32Array`, `Float64Array`, ...),
  `Date` arrays, ISO date strings, or category strings.
- `x0`/`dx` and `y0`/`dy`: implicit coordinates when you omit `x` or `y`.
- `text`, `customdata`, and `ids`: per-point extra data for labels, hover templates, and matching
  points across updates.
- `null` or `NaN` in `x` or `y` leaves the point out.

See [Data formats](/fundamentals/data-formats) for datasets and column references.

## Variations

Chart-level examples for this section (markers with a colorscale, bubble sizes, text labels, and
error bars) will be added with the M1 runtime. Until then, this demo shows the marker primitive
coloring points from a colorscale.

<Example id="_dev/markers-colorscale" />

## Styling

- `mode`: `'markers'`, `'lines'`, `'text'`, a combination such as `'lines+markers'`, or `'none'`.
- `marker.symbol`: the marker shape, such as `'circle'`, `'square'`, `'diamond'`, or `'x'`.
- `marker.size`: size in pixels. Pass an array for per-point sizes (bubble charts).
- `marker.color`: one color, an array of colors, or an array of numbers mapped through
  `marker.colorscale` (with `cmin`, `cmax`, and `showscale`).
- `marker.opacity` and `marker.line.color` / `marker.line.width` for the outline.
- `opacity` for the whole trace.

Most marker attributes accept per-point arrays. Values you do not set come from the
[theme](/fundamentals/styling-themes).

## Interactivity

TODO: document hover (`closest`, `x`, `y`), box and lasso selection with `selected` and
`unselected` styles, and click events once they land in M1.

## 3D-native options

TODO: document sphere-style markers and viewing a scatter subplot in 2.5D once materials and
`view3d` land.

## Performance notes

TODO: document the 1M-point target, the typed-array fast path, and the cost of marker outlines.

## Accessibility notes

TODO: document what the DOM mirror announces for scatter traces, keyboard navigation between
points, and using `marker.symbol` alongside color.

## Attribute reference

See the [scatter attribute reference](/reference/scatter) for every attribute, its type, and its
default.

## Related charts

- [Line](/charts/basic/line): the same trace with `mode: 'lines'`
- [Bar](/charts/basic/bar): compare values across categories

## Plotly migration notes

- `scatter` and `scattergl` are the same trace in Holochart. Rename `scattergl` to `scatter`.
- The default `mode` follows Plotly: `'lines+markers'` for fewer than 20 points, `'lines'`
  otherwise. Set `mode` explicitly to get markers only.
- Attribute names and `hovertemplate` syntax match Plotly.
