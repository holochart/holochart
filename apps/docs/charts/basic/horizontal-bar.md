---
title: Horizontal bar
description: Bars that run left to right, for ranked lists, long category labels, and back-to-back comparisons.
status: complete
chart: bar
---

# Horizontal bar

## Overview

A horizontal bar chart is a [bar chart](/charts/basic/bar) turned sideways: categories go down the
y axis and bar lengths along x. Use it when category labels are long (they stay horizontal and
readable), when you rank many categories, or for back-to-back comparisons such as a population
pyramid.

It is the `bar` trace with `orientation: 'h'`. Everything on the [bar page](/charts/basic/bar)
applies, with x and y swapped.

Pick a different chart when the categories have a natural left-to-right order such as time: use
vertical [bars](/charts/basic/bar) or a [line](/charts/basic/line).

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

const chart = createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'bar',
      orientation: 'h',
      y: ['Other', 'Social networks', 'Direct traffic', 'Search engines'],
      x: [1.7, 14.1, 21.5, 38.2],
    },
  ],
});
```

Category axes run from the bottom up, so the first category is at the bottom. Sort ascending to
put the largest bar on top, either in the data or with `yaxis.categoryorder: 'total ascending'`
(see [sorted bars](/charts/basic/bar#sorted-by-value)). The live example sorts the data itself,
adds value labels past the bar ends and highlights one bar with a per-bar color array:

<Example id="recipes/ranked-bars" />

## Data format

- `y`: the categories (or numbers or dates). `x`: the bar lengths.
- Values can be negative; those bars grow to the left of the base.
- `base`, `width`, and `offset` work as for vertical bars, along the swapped axes. `base` moves
  the start of each bar away from zero (Gantt charts build on this; a helper is planned for M2).
- `text` and `customdata` hold per-bar labels and extra data for templates.
- To keep a fixed category order, set `yaxis.categoryorder: 'array'` and
  `yaxis.categoryarray`.

## Variations

### Log axis and colorscale

On a log x axis, bars have no zero to start from, so they start below the visible range (Plotly
semantics). Numeric `marker.color` maps through a colorscale.

<Example id="bar/horizontal" />

### Population pyramid

Two traces back to back: negate one trace's values so it grows left, and use
`barmode: 'relative'` so both share a row. `xaxis.tickvals` and `ticktext` label the axis with
absolute values, and `customdata` carries the unsigned numbers for `hovertemplate`.

<Example id="recipes/population-pyramid" />

### 100% stacked bars

`barmode: 'stack'` with `barnorm: 'percent'` scales each row to 100, which suits survey answers
(Likert scales). A diverging palette orders the answers from negative to positive.

<Example id="recipes/percent-stacked-bars" />

### Labels on horizontal bars

`textposition: 'auto'`, `'inside'`, and `'outside'` work the same way on horizontal bars. The
right-hand subplot of this example shows category names inside horizontal bars, next to vertical
bars with value labels.

<Example id="bar/text" />

### Dumbbell instead of grouped bars

When you compare two values per category, a dumbbell (two dots and a connector) is often clearer
than two grouped horizontal bars. It is built from scatter traces; see the
[scatter page](/charts/basic/scatter#dumbbell).

<Example id="recipes/dumbbell" />

## Styling

The same attributes as [vertical bars](/charts/basic/bar#styling): `marker.color`,
`marker.line`, `marker.opacity`, `marker.cornerradius`, the text attributes, and
`layout.barmode`, `bargap`, `bargroupgap`, and `barnorm`. For long labels:

- Give the y axis room: raise `margin.l`, or shorten the labels.
- `yaxis.ticksuffix` / `xaxis.ticksuffix` add units such as `'%'` to tick labels.
- `bargap: 0.05` or less closes the bars up for pyramids and histogram-like displays.

## Interactivity

Hover, selection, zoom, and click work as on [vertical bars](/charts/basic/bar#interactivity),
with the axes swapped: `hovermode: 'y'` or `'y unified'` shows every trace in the hovered row. Use
`hovertemplate` such as `'%{y}: %{x:.1f}%<extra></extra>'`. For a ranked list, you can lock the
category axis with `yaxis.fixedrange: true` so zooming only changes the value axis.

## Performance notes

The same as for [vertical bars](/charts/basic/bar#performance-notes): one instanced rectangle set
per trace, stacking in the calc step, and text labels typeset asynchronously. A chart with more
rows than fit on screen is hard to read anyway; show the top N and put the rest in a table.

## Accessibility notes

- **Screen readers:** the chart is a `<canvas>`, and the DOM mirror for assistive technology is
  not built yet (planned for M2, see the [accessibility guide](/guides/accessibility)). Add a
  caption or `aria-label`, and for ranked lists consider a plain ordered list or table next to the
  chart.
- **Keyboard:** there is no keyboard navigation yet.
- **Color:** value labels at the bar ends carry the numbers without color. When you highlight one
  bar by color, say which one in the title or caption too.

## Attribute reference

Horizontal bars use the bar trace. See the [bar attribute reference](/reference/bar), especially
[`orientation`](/reference/bar#orientation), and the [layout reference](/reference/layout#barmode)
for `barmode` and `barnorm`.

## Related charts

- [Bar](/charts/basic/bar): vertical bars, grouped and stacked
- [Scatter](/charts/basic/scatter): dot plots and dumbbells, which compare values without bar
  length
- Gantt charts (horizontal bars on a date axis) are planned for M2

## Plotly migration notes

- Same as Plotly: `orientation: 'h'` with categories in `y` and values in `x`. Figures port
  unchanged.
- Categories keep the order of the data, as in Plotly. Sort the data yourself, or use
  `yaxis.categoryorder`: `'category ascending'`, `'array'` with `categoryarray`, or a value-based
  order such as `'total ascending'` (also `min`, `max`, `sum`, `mean`, `median`).
- Not supported yet: `marker.pattern` (E8.10) and the timeline helper (M2).
