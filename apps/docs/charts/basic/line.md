---
title: Line
description: Connect data points with lines to show trends over an ordered variable such as time.
status: draft
chart: scatter
---

# Line

## Overview

A line chart connects data points in order. Use it to show a trend over time or over any other
ordered variable, or to compare a few series. A line chart is a [scatter](/charts/basic/scatter)
trace with `mode: 'lines'` (or `'lines+markers'` to show the points too).

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

createChart(el, {
  data: [{ type: 'scatter', x: [1, 2, 3, 4, 5], y: [2, 4, 3, 6, 5], mode: 'lines' }],
});
```

The live demo below is a placeholder. It shows the GPU line primitive that line traces are built
on, not a full chart. It will be replaced by chart-level examples when the M1 runtime lands.

<Example id="_dev/lines-series" />

## Data format

- `x` and `y`: the point coordinates, in drawing order. Arrays, typed arrays, `Date` arrays, ISO
  date strings, or category strings.
- `null` or `NaN` values create a gap in the line. Set `connectgaps: true` to draw across gaps.
- For time series, pass dates in `x`. See
  [Working with dates & time series](/fundamentals/dates-time-series).

## Variations

Chart-level examples for this section (multiple series, step lines, splines, and lines with
markers) will be added with the M1 runtime. Until then, this demo shows the line primitive's joins
and dash patterns.

<Example id="_dev/lines-joins-dashes" />

## Styling

- `line.color` and `line.width` (in pixels).
- `line.dash`: `'solid'`, `'dot'`, `'dash'`, `'longdash'`, `'dashdot'`, `'longdashdot'`, or a
  custom dash list.
- `line.shape`: `'linear'`, `'spline'`, or the step shapes `'hv'`, `'vh'`, `'hvh'`, `'vhv'`.
- `line.smoothing`: how curved a `'spline'` line is, from 0 to 1.3.
- `mode: 'lines+markers'` adds markers, styled with the `marker.*` attributes from
  [Scatter](/charts/basic/scatter#styling).

## Interactivity

TODO: document hover on lines (nearest vertex), unified hover across series, and legend toggling
once they land in M1.

## 3D-native options

TODO: document 3D lines (`scatter3d` with `mode: 'lines'`) and ribbon options once 3D lands in M6.

## Performance notes

TODO: document streaming with `extendTraces`, line simplification with `line.simplify`, and the
cost of dashes and wide lines.

## Accessibility notes

TODO: document what the DOM mirror announces for line traces, and using `line.dash` alongside
color to tell series apart.

## Attribute reference

Line charts use the scatter trace. See the [scatter attribute reference](/reference/scatter),
especially the `line` attributes.

## Related charts

- [Scatter](/charts/basic/scatter): the same trace with markers only
- [Bar](/charts/basic/bar): discrete comparisons instead of trends

## Plotly migration notes

- A Plotly line chart is also a `scatter` trace with `mode: 'lines'`, so figures carry over
  unchanged.
- `scattergl` line traces become `scatter`. There is no separate WebGL trace.
- `line.shape: 'spline'` uses the same smoothing semantics as Plotly.
