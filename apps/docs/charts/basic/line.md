---
title: Line
description: Connect data points with lines to show trends over an ordered variable such as time.
status: complete
chart: scatter
---

# Line

## Overview

A line chart connects data points in order. Use it to show a trend over time or over any other
ordered variable, or to compare a handful of series. A line chart is a
[scatter](/charts/basic/scatter) trace with `mode: 'lines'`, or `'lines+markers'` to show the
points too.

Pick a different chart when:

- the x values have no order (two independent measurements): use a
  [scatter plot](/charts/basic/scatter);
- you compare a few separate totals rather than a trend: use a [bar chart](/charts/basic/bar);
- you need a shaded area under or between lines: area fills (`fill`, `stackgroup`) arrive in M2.
  Until then, see the error band recipe below.

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

const chart = createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'scatter',
      mode: 'lines',
      x: ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04'],
      y: [1200, 1260, 1190, 1310],
    },
  ],
});
```

ISO date strings in `x` make the x axis a date axis on its own. The live example draws a year of
daily values with a title and axis titles:

<Example id="line/basic" />

## Data format

- `x` and `y`: the point coordinates, drawn in array order (sort them first if they aren't).
  Plain arrays, typed arrays, `Date` objects, ISO date strings, or category strings.
- `null` or `NaN` in `y` (or `x`) breaks the line. Set `connectgaps: true` to draw across gaps.
- One trace per series. Use `name` for the legend entry and let the colorway assign colors.
- For time series, see [Working with dates & time series](/fundamentals/dates-time-series).

## Variations

### Step lines

`line.shape: 'hv'` holds each value until the next point, which suits rates, prices, and states.
`'vh'` steps first, and `'hvh'` / `'vhv'` step halfway between points.

<Example id="line/step" />

### Spline vs linear

`line.shape: 'spline'` draws a smooth curve through every point. `line.smoothing` (0 to 1.3,
default 1) sets how round it is. A spline can overshoot between points, so prefer straight lines
when exact values between samples matter.

<Example id="line/spline" />

### Gaps and connectgaps

Missing values break the line by default, which shows the reader that data is missing. Set
`connectgaps: true` to bridge them with a straight segment.

<Example id="line/gaps" />

### Dashes and widths

`line.dash` takes `'solid'`, `'dot'`, `'dash'`, `'longdash'`, `'dashdot'`, `'longdashdot'`, or a
dash list in pixels such as `'8px,3px,2px,3px'`. `line.width` is in pixels. A common pattern:
solid for actuals, dashed for a forecast, dotted for a target.

<Example id="line/dashes" />

### Many series with a legend

Each trace takes the next colorway color and a legend entry. Click a legend entry to hide the
trace, and double-click to show only that trace. `hovermode: 'x unified'` lists every series at
the hovered x in one label.

<Example id="line/many-series" />

### Error bands

Holochart doesn't have `fill` yet (planned for M2), so a shaded band between an upper and a lower
bound needs a workaround. Two work today:

- **Dense error bars.** Give the line many points and a thick, capless, **opaque** `error_y`
  (`width: 0`, `thickness` larger than the pixel spacing between points). The bars overlap into a
  solid band drawn under the line. A semi-transparent color would darken where bars overlap.
- **Bound lines.** Draw the upper and lower bounds as two thin dashed traces, grouped with the
  mean using `legendgroup`.

<Example id="recipes/error-bands" />

### Every line shape

All line shapes, dash styles, and `connectgaps` on the same eight points:

<Example id="scatter/lines-shapes" />

## Styling

- `line.color` and `line.width` (pixels). Without a color, the line uses the trace's colorway
  color.
- `line.dash`: a named style or a dash list, as above.
- `line.shape` (`'linear'`, `'spline'`, `'hv'`, `'vh'`, `'hvh'`, `'vhv'`) and `line.smoothing`.
- `mode: 'lines+markers'` adds markers, styled with `marker.*` as on the
  [scatter page](/charts/basic/scatter#styling). `mode: 'lines+text'` labels points.
- `opacity` fades the whole trace, and `zorder` draws a trace above others.
- Axis and legend styling is in `layout`, see
  [Layout, axes & subplots](/fundamentals/layout-axes-subplots).

## Interactivity

- **Hover.** With the default `hovermode: 'closest'`, hovering near a line shows the nearest data
  point of that trace. `'x'` shows all traces at the hovered x; `'x unified'` shows them in a
  single label, which works well for time series. Customize the text with `hovertemplate`, for
  example `'%{x|%b %d}: %{y:,.0f}<extra></extra>'`.
- **Zoom and pan.** Drag to zoom a range (`dragmode: 'zoom'`, the default), or set
  `dragmode: 'pan'`. Double-click resets. For wheel zoom set `config: { scrollZoom: true }`. On a
  date axis, tick labels adapt to the zoom level.
- **Legend.** Click to toggle a trace, double-click to isolate it. `legendclick` and
  `legenddoubleclick` events fire first; return `false` from a listener to cancel the default.
- **Events.** `chart.on('relayout', ...)` reports the new axis ranges after a zoom or pan, so you
  can load more detail for the visible range. See the [events reference](/reference/events).

## Performance notes

- Lines are drawn as screen-space quads on the GPU with proper joins. In the M0 line benchmark,
  1,000,000 solid segments rendered at about 58 fps and dashed ones at about 22 fps
  ([spike B](https://github.com/holochart/holochart/blob/main/docs/spikes/b-lines.md)). Dashes
  cost more; use them for a few series, not for large ones.
- `line.simplify` (on by default) decimates dense lines with increasing x to at most four
  vertices per pixel column, keeping the minimum and maximum. It is visually lossless and is
  recomputed when you zoom.
- Pass typed arrays (`Float64Array`) for long series. Date strings have to be parsed, so for very
  long time series pass milliseconds since the epoch and set the axis to `type: 'date'`.
- `line.shape: 'spline'` is tessellated on the CPU, so it costs more than straight lines on large
  data.
- For live data, append with `extendTraces` instead of replacing the arrays. Only the new points
  are converted and uploaded, and `maxPoints` drops points from the other end for a rolling
  window:

  ```ts
  // Append one point to traces 0 and 1, keeping the last 10,000 of each.
  await chart.extendTraces({ x: [[t], [t]], y: [[a], [b]] }, [0, 1], 10_000);
  ```

  `prependTraces` adds points at the start. Both emit a `redraw` event once drawn.

## Accessibility notes

- **Screen readers:** the chart is a `<canvas>`, and the DOM mirror that describes it to assistive
  technology is not built yet (planned for M2, see the [accessibility guide](/guides/accessibility)).
  Add a caption or `aria-label` that states the trend, and a table of the key values.
- **Keyboard:** there is no keyboard navigation yet.
- **Color:** with several series, vary `line.dash` (and markers) as well as color, and label
  lines directly where you can. Keep the number of series small, or highlight one and gray out
  the rest.

## Attribute reference

Line charts use the scatter trace. See the [scatter attribute reference](/reference/scatter),
especially [`line`](/reference/scatter#line) and
[`connectgaps`](/reference/scatter#connectgaps).

## Related charts

- [Scatter](/charts/basic/scatter): the same trace with markers only
- [Bar](/charts/basic/bar): discrete comparisons instead of trends
- Area charts (`fill`, `stackgroup`) are planned for M2

## Plotly migration notes

- A Plotly line chart is also a `scatter` trace with `mode: 'lines'`, so figures carry over.
- `scattergl` line traces become `scatter`. There is no separate WebGL trace.
- `line.shape: 'spline'` follows Plotly's smoothing semantics.
- `line.simplify` is on by default, as in Plotly, but Holochart decimates per pixel column and
  re-runs it on zoom.
- Not supported yet: `fill`, `fillcolor`, `stackgroup`, `groupnorm` (M2), `line.backoff`, and
  `hoveron: 'fills'`. Error bands need the workaround above until `fill: 'tonexty'` lands.
