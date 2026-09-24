---
title: Bar
description: Compare values across categories with vertical or horizontal bars, grouped or stacked.
status: complete
chart: bar
---

# Bar

## Overview

A bar chart draws one rectangle per category, with a length proportional to its value. Use it to
compare amounts across categories or periods. Bars can be vertical or
[horizontal](/charts/basic/horizontal-bar), and several bar traces can be grouped side by side,
stacked, or overlaid.

Pick a different chart when:

- the values don't start from a meaningful zero (bar length would mislead): use a
  [dot plot](/charts/basic/scatter#dot-plot);
- x is continuous and the trend matters: use a [line chart](/charts/basic/line);
- you have many long category labels: use [horizontal bars](/charts/basic/horizontal-bar).

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

const chart = createChart(document.getElementById('chart')!, {
  data: [{ type: 'bar', x: ['Mon', 'Tue', 'Wed'], y: [12, 18, 7] }],
});
```

Bars grow from zero, both up and down, and the y range always includes zero. The live example
adds a negative value, outlines, and rounded corners:

<Example id="bar/basic" />

## Data format

- `x` and `y`: positions and values. For vertical bars `x` holds the categories (or numbers or
  dates) and `y` the values. For horizontal bars (`orientation: 'h'`), swap them.
- Values can be negative. Bars then extend below (or left of) the base.
- `base`, `width`, and `offset` set each bar's start, thickness (in axis units), and shift. Each
  takes one value or one per bar. On a date axis, `width` is in milliseconds.
- `x0`/`dx` (or `y0`/`dy`) give implicit positions when you leave out `x` (or `y`).
- `text` and `customdata`: per-bar labels and extra data for templates.
- A `null` or `NaN` value draws no bar.
- Categories appear in the order of the data unless the axis sets `categoryorder` (see
  [sorted by value](#sorted-by-value)).

## Variations

### Grouped bars

With `layout.barmode: 'group'` (the default), bar traces at the same position sit side by side.
`bargap` spaces the positions and `bargroupgap` the bars within a group. Traces that share an
`offsetgroup` share a slot, so a narrow bar can sit in front of a wide one (targets vs actuals).

<Example id="bar/grouped" />

### Stacked bars

`barmode: 'stack'` stacks traces at each position in trace order. `layout.barcornerradius`
rounds only the outer end of each stack. Set `barnorm: 'percent'` to stack to 100.

<Example id="bar/stacked" />

### Positive and negative stacks

`barmode: 'relative'` stacks positive values up from zero and negative values down from zero
separately, for inflows and outflows.

<Example id="bar/relative" />

### Labels on bars

`texttemplate` formats a label per bar with d3 formats. `textposition: 'auto'` puts it inside
when it fits and outside otherwise; `'inside'`, `'outside'`, and `'none'` force a choice.
Inside labels switch between dark and light text to contrast with the bar color.

<Example id="bar/text" />

### Stacked bars with totals

A bar label belongs to one segment, so to label the total of each stack, add a `scatter` trace
with `mode: 'text'` at the totals, `textposition: 'top center'`, `showlegend: false`, and
`hoverinfo: 'skip'`. Autorange doesn't make room for text, so set the y range with some headroom.

<Example id="recipes/stacked-totals" />

### Sorted by value

Set `categoryorder` on the category axis to sort it by the bar values, whatever the order of the
data: `'total descending'` ranks each category by the sum over all traces (stacked or grouped),
and `'min'`, `'max'`, `'sum'`, `'mean'` and `'median'` work the same way, `ascending` or
`descending`. Ties keep the data order. On horizontal bars, sort the y axis `'total ascending'` to
put the largest bar on top, because category axes run bottom-up.

<Example id="bar/sorted" />

### Horizontal bars on a log axis

`orientation: 'h'` turns bars sideways. On a log axis, bars start below the visible range, as in
Plotly. Numeric `marker.color` maps through a colorscale. More in
[Horizontal bar](/charts/basic/horizontal-bar).

<Example id="bar/horizontal" />

## Styling

- `marker.color`: one color, one per bar, or numbers mapped through `marker.colorscale`.
- `marker.line.color` and `marker.line.width` for outlines (white outlines separate stacked
  segments well).
- `marker.opacity` and `marker.cornerradius` (pixels or a percentage string such as `'30%'`);
  `layout.barcornerradius` sets it for all traces.
- `textfont`, `insidetextfont`, `outsidetextfont`, `textangle`, `insidetextanchor`, and
  `constraintext` for labels.
- `layout.barmode`, `bargap`, `bargroupgap`, and `barnorm` for how bar traces combine.
- `xaxis.categoryorder` (or `yaxis.` for horizontal bars) and `categoryarray` for the order of
  the categories.
- Pattern fills (`marker.pattern`) come later (plan E8.10).

## Interactivity

- **Hover.** Hovering a bar shows its label. With the default `hovermode: 'closest'`, the bar under
  the pointer is picked. `hovermode: 'x'` (or `'x unified'`) shows every trace at that position,
  which suits grouped and stacked bars. Thin bars keep a 4 px minimum hit size. Use `hovertemplate` with `%{x}`, `%{y}`, `%{text}`, and `%{customdata}`.
- **Zoom and pan.** Drag to zoom (the default `dragmode`), double-click to reset.
- **Selection.** Box and lasso selection select bars; unselected bars fade (style with
  `selected.marker` / `unselected.marker`).
- **Click.** `chart.on('click', (e) => e.points[0].x)` gives the clicked category, for drill-down.
- **Legend.** Click an entry to hide a trace; the remaining stacks and groups re-flow.

## Performance notes

- Bars are instanced rectangles, so the number of draw calls doesn't grow with the number of
  bars.
- Stacking and grouping run on the CPU in the calc step. Changing a value re-runs the calc for
  the bar traces on that axis; changing a color only restyles.
- Hover and selection test the bar boxes on the CPU. That is exact and cheap for typical bar
  counts; for very many thin bars, a [line](/charts/basic/line) or a histogram (M3) often reads
  better anyway.
- Labels are text, which is typeset asynchronously. Thousands of labels take longer to appear
  than the bars themselves; use `textposition: 'none'` or labels on the top N only for large
  data.

## Accessibility notes

- **Screen readers:** the chart is a `<canvas>`. The DOM mirror that describes bars to assistive
  technology is not built yet (planned for M2, see the [accessibility guide](/guides/accessibility)).
  Add a caption or `aria-label`, and consider a visible data table.
- **Keyboard:** there is no keyboard navigation between bars yet.
- **Color:** bar labels (`texttemplate`) carry exact values without relying on color. In stacked
  bars, keep the segment order the same as the legend and use white outlines between segments.
  Hatch patterns (`marker.pattern`) for print and color-blind readers come later.

## Attribute reference

See the [bar attribute reference](/reference/bar) for every attribute, its type, and its default.
Bar layout options such as [`barmode`](/reference/layout#barmode) and
[`bargap`](/reference/layout#bargap) are in the layout reference.

## Related charts

- [Horizontal bar](/charts/basic/horizontal-bar): ranked categories and long labels
- [Line](/charts/basic/line): trends over an ordered variable
- [Scatter](/charts/basic/scatter): lollipop and dot plots, lighter alternatives to bars

<Example id="recipes/lollipop" :height="320" />

## Plotly migration notes

- Attribute names, `barmode` values, `barnorm`, and `offsetgroup`/`alignmentgroup` behavior match
  Plotly.
- Value-based `categoryorder`s (`'total descending'`, …) match Plotly, with two small
  differences: `median` sorts numerically (Plotly compares the values as strings), and categories
  without values sort last for `min`/`max`/`mean`/`median`. `'geometric mean …'` is not supported.
- Draw order matches Plotly: bars draw below scatter traces whatever their order in `data`, and
  a higher `zorder` (on bars too) draws a trace on top of lower ones.
- Not supported yet: `marker.pattern` (E8.10) and `xperiod` alignment for bars.
- Bar extrusion (`depth`, `bevel`, `material`) is a planned Holochart extension (M6).
