---
title: Area
description: Fill the area under a line, between two lines, or inside a shape, or stack series.
status: complete
chart: scatter
---

# Area

## Overview

An area chart fills the space under a line. Use it to show how a quantity changes over time when
its size matters, how parts add up to a total (stacked areas), how shares of a total evolve (100%
stacked areas), or the range between two bounds (bands). An area chart is a
[scatter](/charts/basic/scatter) trace with `fill` set, or several scatter traces that share a
`stackgroup`.

`fill` can also close a line into a shape (`'toself'`) or fill between two traces (`'tonexty'`),
so the same attribute draws confidence bands, ranges, and arbitrary polygons.

Pick a different chart when:

- you compare several series that don't add up to anything: use a [line chart](/charts/basic/line).
  Overlapping filled areas hide each other;
- the x values are a few categories, not an ordered variable: use a
  [stacked bar chart](/charts/basic/bar);
- the exact values of the upper series in a stack matter: they are hard to read, because each
  band starts where the one below ends. Consider small multiples of lines instead.

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

const chart = createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'scatter',
      mode: 'lines',
      fill: 'tozeroy',
      x: ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04'],
      y: [5.2, 7.9, 6.1, 8.4],
    },
  ],
});
```

`fill: 'tozeroy'` fills from the line down to y = 0. Without a `fillcolor`, the fill takes the line
color at half opacity. The live example draws a year of daily values:

<Example id="area/basic" />

## Data format

- `x` and `y`: the line's points, drawn in array order, exactly as for a
  [line chart](/charts/basic/line#data-format).
- `fill` picks what is filled:
  - `'tozeroy'` / `'tozerox'`: down to y = 0 (or across to x = 0).
  - `'tonexty'` / `'tonextx'`: to the previous trace on the same subplot, joining the end points
    with straight lines. Without a previous trace, they act like `'tozeroy'` / `'tozerox'`.
  - `'toself'`: joins the last point to the first and fills the closed shape.
  - `'tonext'`: fills between this trace and the previous one when one encloses the other, such as
    a ring. Without a previous trace it acts like `'toself'`.
- "Previous trace" means the previous visible scatter trace on the same subplot that is in the
  same `stackgroup` (or, for unstacked traces, the previous unstacked one). Hiding a trace from the
  legend re-links the fill to the trace before it.
- `null` or `NaN` values break the line. Fills to zero or to the next trace bridge the gap with a
  straight edge; `'toself'` fills each line segment on its own.
- `stackgroup: 'name'` stacks traces: see [Stacked areas](#stacked-areas). Stacked values are
  matched by position (x, or y for `orientation: 'h'`); see [Stack gaps](#stack-gaps) for traces
  that lack some positions. Stacking needs a numeric (linear or log) value axis.

## Variations

### Stacked areas

Traces with the same `stackgroup` add up: each trace's y values are drawn on top of the traces
before it in the group. Stacking turns on `fill: 'tonexty'` and makes `mode` default to `'lines'`,
so `stackgroup` is often the only attribute you need. Each fill is drawn just above the previous
trace's fill and below its line, so every boundary stays visible. Hovering a stacked point shows
the trace's own value, not the running total.

<Example id="area/stacked" />

### 100% stacked

`groupnorm: 'percent'` scales each position's total to 100 (`'fraction'` scales it to 1), so the
chart shows shares instead of amounts. Set it on the first trace of the group; the first trace that
sets it decides for the whole group. Add `yaxis.ticksuffix: '%'` for the tick labels.

<Example id="area/percent" />

### Range band

To shade the range between a lower and an upper bound, add the lower bound first with
`line.width: 0`, then the upper bound with `fill: 'tonexty'` and a semi-transparent `fillcolor`
such as `'rgba(239, 85, 59, 0.2)'`. Put both in one `legendgroup` and hide one of their legend
entries, so a single click toggles the band. This replaces the older
[error band workaround](/charts/basic/line#error-bands).

<Example id="area/band" />

### Streamgraph

A streamgraph is a stack centered on zero. Make the group's first trace an invisible baseline at
minus half the total for each x: `fill: 'none'`, `line.width: 0`, `showlegend: false`, and
`hoverinfo: 'skip'`. The series stack on top of it. `line.shape: 'spline'` smooths the bands, and
the fills follow the smoothed lines.

<Example id="area/streamgraph" />

### Gradient fills

`fillgradient` draws a colorscale instead of `fillcolor`. `type: 'vertical'` runs the colorscale
along y and `'horizontal'` along x, from `start` to `stop` (data values; by default the fill's own
extent). `'radial'` runs from the center of the fill's bounding box outwards. Use rgba stops to
fade to transparent.

<Example id="area/gradient" />

### Closed shapes

`fill: 'toself'` closes the line into a shape. Edges may cross: fills use the nonzero rule, like
SVG, so the center of a pentagram is filled. A `null` in the data starts a new shape within the
same trace.

<Example id="area/toself" />

### Horizontal stacks

`orientation: 'h'` stacks x values instead of y values and implies `fill: 'tonextx'`. It suits
profiles over a vertical variable such as altitude or depth. As with `groupnorm`, the first trace of
the group that sets `orientation` decides.

<Example id="area/stacked-horizontal" />

### Stack gaps

When a stacked trace lacks some x positions that other traces of its group have,
`stackgaps: 'infer zero'` (the default) counts it as 0 there, and `'interpolate'` interpolates
linearly between its neighbors (constant beyond its ends). Set it on the first trace of the group.

<Example id="area/stackgaps" />

## Styling

- `fillcolor`: any CSS color. The default is the line color (else the marker color) at half
  opacity. Use an rgba color to control the transparency yourself.
- `fillgradient`: `{ type, colorscale, start, stop }`, drawn instead of `fillcolor` (which still
  colors hover labels).
- `line.color`, `line.width`, `line.dash`, and `line.shape`, as on the
  [line page](/charts/basic/line#styling). The fill follows the drawn line, including splines and
  steps. `line.width: 0` draws the fill alone.
- `mode: 'lines+markers'` adds markers on top of the fill.
- In the legend, a filled trace shows a filled swatch with a border in the line color.
- `opacity` fades the whole trace, fill included, and `zorder` changes the drawing order.

## Interactivity

- **Hover.** Stacked traces report their own value at the hovered point, not the stacked total;
  `hovermode: 'x unified'` lists every band at the hovered x, which reads well for stacks. With
  `groupnorm`, the value is the normalized one.
- **Hovering fills.** `hoveron: 'fills'` makes the filled area itself hoverable; the label shows the
  trace name. It is the default for `'toself'` and `'tonext'` fills without markers or text, and
  `'points+fills'` enables both. Fill hover works in `hovermode: 'closest'` only, and only when no
  point is under the pointer.
- **Legend.** Click to hide a trace: the fills of later traces in the stack re-link to the trace
  below it. Group bounds with `legendgroup` so one click toggles a band.
- **Zoom, pan, and events** work as for [line charts](/charts/basic/line#interactivity).

## Performance notes

- Fills are triangulated once. Zoom and pan only change a transform for straight and step lines,
  so they stay as fast as the lines themselves. Spline fills are re-tessellated with their line when
  the zoom changes a lot.
- Fills use the full-resolution path: `line.simplify` decimates the line but not the fill.
- Fills whose edges cross, such as a `'tozeroy'` fill that crosses y = 0 or a band whose bounds
  cross, use an exact nonzero fill on the CPU. It is slower than the default triangulation, so
  expect a larger first-draw cost for very large crossing fills. `'toself'` always uses the nonzero
  rule.
- `extendTraces` works on filled traces, but the fill is rebuilt in full on each append, and
  stacked traces fall back to a full recompute. For fast streams, keep the window short with
  `maxPoints`.

## Accessibility notes

- **Screen readers:** the chart is a `<canvas>`, and the DOM mirror that describes it to assistive
  technology is not built yet (planned for M2, see the [accessibility guide](/guides/accessibility)).
  Add a caption or `aria-label` that states the trend or the composition, and a table of the key
  values.
- **Keyboard:** there is no keyboard navigation yet.
- **Color:** adjacent bands in a stack need enough contrast between them. Label bands directly where
  you can, keep the number of stacked series small, and keep the lines between bands visible. Fill
  patterns (`fillpattern`) for grayscale printing are not supported yet.

## Attribute reference

Area charts use the scatter trace. See the [scatter attribute reference](/reference/scatter),
especially [`fill`](/reference/scatter#fill), [`fillcolor`](/reference/scatter#fillcolor),
[`fillgradient`](/reference/scatter#fillgradient), [`stackgroup`](/reference/scatter#stackgroup),
[`groupnorm`](/reference/scatter#groupnorm), [`stackgaps`](/reference/scatter#stackgaps), and
[`hoveron`](/reference/scatter#hoveron).

## Related charts

- [Line](/charts/basic/line): the same trace without a fill, for comparing series that don't add up
- [Bar](/charts/basic/bar): stacked bars for totals over a few categories
- [Scatter](/charts/basic/scatter): the underlying trace type

## Plotly migration notes

- Plotly area charts are `scatter` traces with `fill` or `stackgroup`, so figures carry over:
  `fill`, `fillcolor`, `fillgradient`, `stackgroup`, `orientation`, `groupnorm`, `stackgaps`, and
  `hoveron` follow Plotly's semantics, with the differences below.
- `scattergl` traces with `fill` become `scatter`.
- Not supported yet: `fillpattern` (planned with patterns, E8.10) and `scattermode: 'group'`.
- Drawing order: Plotly moves a trace down in the drawing order when it fills to a trace that is
  not directly before it. Holochart keeps `zorder` and trace order, and only places each
  `'tonext…'` fill just above the fill of the trace it fills to.
- Spline lines whose first and last points coincide are not smoothed as closed curves.
- Fill hover (`hoveron: 'fills'`) works in `hovermode: 'closest'` only.
