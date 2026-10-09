---
title: Polar bars & wind rose
description: Bars in polar coordinates, stacked or overlaid by angle, for amounts per direction or per period such as wind roses.
status: complete
chart: barpolar
---

# Polar bars & wind rose

<ChartOverview />

## Overview

A polar bar chart draws one bar per angle: an annular sector that starts at the center (or at a
`base`) and reaches out to `r`. Use it for amounts per direction or per point of a cycle: wind
frequency by compass direction, traffic by hour of the day, sales by month. Stacking several
traces outwards gives a **wind rose**, which splits each direction's total by a second variable
such as wind speed.

The `barpolar` trace is the polar twin of [bar](/charts/basic/bar): the same `marker` styling,
drawn on the polar subplots (`layout.polar`, `polar2`, …) that
[scatterpolar](/charts/scientific/polar) traces use. Both trace types can share a subplot.

Pick a different chart when:

- the angle is not a direction or a cycle: an ordinary [bar chart](/charts/basic/bar) compares
  lengths more accurately, because a polar bar's area grows with the square of its radius;
- you have points or a curve rather than amounts: use [scatterpolar](/charts/scientific/polar);
- you want the share of each part of a whole: use a [pie](/charts/basic/pie).

## Minimal example

The figure sketch below shows the essential data shape. Open **Complete source** on the live
example for a runnable module with setup, dependencies and cleanup.

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [{ type: 'barpolar', r: [3, 2, 4, 5], theta: ['N', 'E', 'S', 'W'] }],
  layout: { polar: { angularaxis: { direction: 'clockwise' } } },
});
```

Each `theta` gets a bar of length `r`. With category angles, the bars are spread evenly around the
circle, and `direction: 'clockwise'` starts them at 12 o'clock, like a compass. The live example
stacks two traces over eight directions:

<Example id="polar/barpolar" />

## Data format

- **`r` and `theta`**, as for [scatterpolar](/charts/scientific/polar#data-format): arrays of
  the same length (the shorter one wins), or `r0` / `dr` and `theta0` / `dtheta` for evenly
  stepped values. `theta` is in the trace's `thetaunit` (`'degrees'` by default, `'radians'` or
  `'gradians'`) on a numeric angular axis, or category names on a category axis.
- **Bar extent.** Each bar spans from `base` (default 0, in radial axis units) to `base + r`.
  `width` sets its angular width and `offset` shifts its leading edge from `theta`; both are in
  `thetaunit` on numeric angular axes and in category slots on category axes, and take one value
  or one per bar. By default a bar is centered on its angle and as wide as the smallest angle
  between bars, less `polar.bargap`.
- **Stacking.** With `polar.barmode: 'stack'` (the default), bars of all traces at the same angle
  stack outwards in trace order. Traces that set `base` are not stacked: they are drawn from
  their base. `barmode: 'overlay'` draws every trace from zero, over one another.
- **Missing values.** A bar whose `r` or `theta` is not a number is not drawn.
- **Radial range.** The radial axis autoranges over both ends of every bar, from zero
  (`rangemode: 'tozero'`). Bars are clipped to the radial range and to the sector.

```ts
import { createChart } from '@mk7s/holochart';

// Hours of the day on a numeric angular axis (15° per hour), with bars 12° wide.
createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'barpolar',
      r: [2, 1, 1, 3, 8, 12, 9, 7, 6, 8, 10, 11, 9, 7, 5, 4, 6, 9, 12, 10, 7, 5, 3, 2],
      theta0: 0,
      dtheta: 15,
      width: 12,
    },
  ],
  layout: { polar: { angularaxis: { direction: 'clockwise' } } },
});
```

## Variations

<ChartVariations />

### Wind rose

One trace per wind speed bin, stacked outwards over 16 compass directions, with one color per bin
(`marker.color`), a percent radial axis (`ticksuffix`) and a slightly narrower `bargap`. The
`hovertemplate` reads `%{theta}` and `%{r}`:

<ExampleLink id="polar/wind-rose" />

### Overlaid bars

`polar.barmode: 'overlay'` draws each trace from the center, so bars at the same angle overlap;
translucent markers (`marker.opacity`) keep both visible. The angular axis here is numeric
(degrees, 30° apart), so bars are as wide as the smallest angle between them, less
`polar.bargap` (0.25):

<ExampleLink id="polar/barpolar-overlay" />

### Floating bars: base, width and offset

`base` starts each bar away from the center, for ranges per angle: here the daily temperature
range per month, from the low to the high. `width` sets the angular width (in category slots on
this category axis) and `offset` shifts each bar's leading edge off its angle, so two series sit
side by side. Traces with a `base` are not stacked, even in `stack` mode:

<ExampleLink id="polar/barpolar-base" />

### Bars on a polygon grid

With `polar.gridshape: 'linear'` (category angular axes), the grid is a polygon through the
category angles, and stacked bars follow the polygon's straight edges instead of arcs. `hole`
leaves the middle free:

<ExampleLink id="polar/barpolar-polygon" />

## Styling

- **Bars.** `marker.color` (one color, one per bar, or numbers mapped through `colorscale` with
  `cmin` / `cmax` / `cmid`, a colorbar or a shared `coloraxis`), `marker.line` (`color`, `width`)
  for the outline, and `marker.opacity`. `selected` and `unselected` style selected bars. See the
  [bar page](/charts/basic/bar#styling).
- **Spacing.** `polar.bargap` (default 0.1) is the gap between bars at adjacent angles, as a
  fraction of the smallest angle between them; `width` and `offset` override it per trace or per
  bar.
- **Subplot and axes.** `polar.bgcolor`, `sector`, `hole`, `gridshape`, and the radial and angular
  axes, as for [scatterpolar](/charts/scientific/polar#styling). `angularaxis.direction:
'clockwise'` (which starts at north) makes compass roses.
- **Default look.** The default `holochart` template gives bars a thin outline in the background
  color, which separates stacked bars; `layout.template: 'plotly-classic'` renders Plotly's
  defaults. See [themes and templates](/customization/themes-templates).

## Interactivity

- **Hover.** The bar under the pointer shows `r: …` (the bar's own length, not the stacked
  total) and `θ: …`, then its `text` or `hovertext`; the label sits on the middle of the bar's
  outer edge. A marker of a scatterpolar trace within reach wins over a bar, and among
  overlapping bars the narrower one wins. `hovertemplate` takes `%{r}`, `%{theta}`, `%{text}` and
  `%{customdata}`.
- **Zoom and rotation.** The polar subplot's drags work as with scatterpolar: the radial axis
  handle changes the radial range or the axis angle, the band just outside the circle rotates the
  angular axis, a zoom box sets the radial range, and a double-click resets. They emit
  `relayouting` and `relayout` with Plotly's keys. See
  [scatterpolar interactivity](/charts/scientific/polar#interactivity).
- **Events.** `hover` and `click` points carry `r`, `theta` and `pointNumber`:

  ```ts
  chart.on('click', (e) => console.log(e.points[0]?.theta, e.points[0]?.r));
  ```

- **Selection.** With `dragmode: 'select'` or `'lasso'`, a bar is selected when the middle of
  its outer edge is inside the box or lasso (Plotly's rule); Shift adds, a double-click clears.
  `selected` / `unselected` style the bars, and `selected` points carry `r` and `theta`. See
  [scatterpolar selection](/charts/scientific/polar#interactivity).
- **Transitions.** Transitions and `animate` don't interpolate polar bars, as in Plotly.

## Performance notes

- On circular grids, a trace's bars are one instanced GPU draw call (annular sectors drawn by
  the arc primitive, outlines included), however many bars it has.
- On polygon grids (`gridshape: 'linear'`), bars are batched polygon fills plus an outline.
- Zoom and rotation redraw the bars from the subplot without re-running the figure pipeline.
  Stacking runs once per layout pass over every bar trace of the subplot.
- With `@mk7s/holochart-runtime` and your own module list, register `barpolar` with
  `polarComponent` (the axes and drags); `sciTraces` includes both. See the
  [performance guide](/guides/performance).

## Accessibility notes

- **Screen readers:** the chart is a `<canvas>`; the hidden description (see the
  [accessibility guide](/guides/accessibility)) reads each trace as a "polar bar" with its bar
  count and the lowest and highest bar (`r` with its angle, formatted like the hover labels), and
  its data table lists the bars' `r` and `θ` (and `text` when given per bar).
- **Keyboard:** Tab moves into the plot area; the arrow keys then step through the bars, each
  showing its hover label. See [the keys by chart
  family](/guides/accessibility#keys-by-chart-family). The script-tag build leaves these stops out
  for now.
- **Reading the chart:** a bar's area grows with the square of its length, so outer segments of
  a wind rose look bigger than they are. Say what the radial axis measures (a `ticksuffix` or
  axis title), and keep the number of stacked bins small.
- **Color:** use an ordered sequence of colors for ordered bins (wind speed), light to dark or
  along a sequential scale, so the order reads without the legend.

## Attribute reference

See the [barpolar attribute reference](/reference/barpolar) for every trace attribute, its type
and its default. The subplot, [`barmode`](/reference/layout#polar.barmode) and
[`bargap`](/reference/layout#polar.bargap) are under [`polar`](/reference/layout#polar) in the
layout reference.

## Related charts

- [Polar & radar](/charts/scientific/polar): markers, lines and filled shapes on the same
  subplots
- [Bar](/charts/basic/bar): the cartesian twin, better for comparing lengths
- [Pie](/charts/basic/pie): shares of a whole

## Plotly migration notes

- Attribute names and defaults match Plotly's `barpolar` and `layout.polar.barmode` /
  `bargap`: `r`, `theta`, `base`, `offset`, `width`, `thetaunit`, `subplot`, `marker`,
  `hovertemplate`. Stacking and default widths follow Plotly's rules.
- On polygon grids (`gridshape: 'linear'`), bars are drawn along the polygon's straight edges,
  which can differ slightly from Plotly's drawing.
- `thetaunit: 'gradians'` converts gradians (400 per turn); plotly.js reads them as radians.
- Transitions don't interpolate polar bars; Plotly doesn't either.
- `marker.pattern` hatches the bars as on bar charts, with tiles anchored at the pole on
  circular grids (see [Patterns & textures](/customization/markers-patterns)).
- Polar selections aren't stored in `layout.selections`, as in Plotly, and their events have no
  `range` / `lassoPoints`.
