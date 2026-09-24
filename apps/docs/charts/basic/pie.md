---
title: Pie
description: Show how a whole splits into a few parts, as a pie or a donut.
status: complete
chart: pie
---

# Pie

## Overview

A pie chart splits a circle into slices, one per label, with each slice's angle proportional to
its value. Use it to show how a whole divides into a few parts, especially when one or two parts
dominate: "more than half", "about a quarter". A donut (`hole`) works the same way and leaves room
for a total or a title in the middle.

Pick a different chart when:

- you compare more than about six parts, or parts of similar size: angles are hard to compare, so
  use a sorted [horizontal bar chart](/charts/basic/horizontal-bar);
- you compare the same parts across several groups: use stacked or grouped
  [bars](/charts/basic/bar) rather than several pies;
- the values don't add up to a meaningful whole (averages, rates, values that can be negative);
- the parts form a hierarchy: sunburst and treemap charts arrive in M3.

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

const chart = createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'pie',
      labels: ['Housing', 'Food', 'Transport', 'Savings'],
      values: [1450, 620, 380, 540],
    },
  ],
});
```

Slices are sorted largest first (`sort: true`) and drawn counterclockwise from 12 o'clock, each
labeled with its percent. The legend lists one item per label:

<Example id="pie/basic" />

## Data format

- `values`: the size of each slice. Negative values and `null` / `NaN` are skipped; zeros are kept
  (they get a legend item but no area).
- `labels`: the name of each slice, shown in the legend, hover, and `textinfo`. Slices with the
  same label are merged and their values added, so you can pass raw rows and let the pie
  aggregate them.
- Without `values`, each label counts once: `labels: ['a', 'b', 'a']` draws `a` at 2/3 and `b` at
  1/3, which counts categories without a pre-aggregation step.
- Without `labels`, slices are named `label0`, `label0 + dlabel`, … (defaults 0 and 1).
- `text` and `hovertext`: extra per-slice strings for `textinfo: 'text'`, `%{text}` in templates,
  and hover.
- Plain arrays and typed arrays (`Float64Array`) both work for `values`.

## Variations

### Donut with a centered title

`hole` (0 to 1) is the fraction of the radius cut out of the middle. With a hole,
`title.position: 'middle center'` puts the trace title inside it, a good place for the total.
Title text accepts `<b>`, `<i>`, and `<br>`.

<Example id="pie/donut" />

### Pulled slices and outside labels

`pull` moves slices out from the center by a fraction of the radius: one number for every slice,
or an array with one entry per slice to emphasize a few. The pie shrinks so the largest pull
still fits. `textposition: 'outside'` puts labels around the pie with leader lines;
`'inside'` keeps them in the slices, and `'auto'` (the default) puts each label inside when it
fits and outside when it doesn't. `rotation` (degrees) turns the start angle, and
`direction: 'clockwise'` reverses the order.

<Example id="pie/pulled" />

### Many slices and collision avoidance

With many small slices, outside labels would overlap. Holochart spreads them apart vertically on
each side of the pie, like Plotly, and draws a leader line from each label to its slice. Give
outside labels room with `layout.margin`: pie labels don't push the margins yet.

<Example id="pie/many-slices" />

More than a dozen slices is usually a sign to group the tail into an "Other" slice or to switch to
a sorted bar chart.

### Text info, templates, and orientation

`textinfo` picks what each slice shows: any of `label`, `text`, `value`, and `percent` joined
with `+` (`'label+percent'`), or `'none'`. For full control, `texttemplate` formats the text with
`%{label}`, `%{value}`, `%{percent}`, `%{text}`, and `%{customdata}`, plus d3 formats:
`'%{label}<br>%{value:$,.0f}'`.

`insidetextorientation` sets how labels inside slices are turned: `'horizontal'` keeps them level
(shrinking them to fit thin slices), `'radial'` runs them along the radius, `'tangential'` along
the circle, and `'auto'` (the default) picks whichever fits the label largest, per slice. Fonts
come from `textfont`, overridden by `insidetextfont` and `outsidetextfont`; inside labels switch
between dark and light text to contrast with the slice color unless you set a color.

<Example id="pie/text-orientation" :height="640" />

### Multiple pies in a grid with scalegroup

Each pie has a `domain`: the part of the plot area it fills (`domain.x`, `domain.y` as fractions).
Simpler, set `layout.grid: { rows, columns }` and pick a cell with `domain.row` and
`domain.column`. A pie stays round and centered in its cell.

By default every pie fills its cell, so a pie of 400 looks as big as a pie of 900. Give the pies
the same `scalegroup` to make their areas proportional to their totals. The legend shows each
label once, and a legend click hides that label in every pie.

<Example id="pie/grid-scalegroup" :height="420" />

## Styling

- **Colors.** `marker.colors` sets one color per slice. Without it, slices take their colors from
  `layout.piecolorway` (default: the `colorway`), by label: the same label gets the same color in
  every pie of the figure. `layout.extendpiecolors` (default `true`) extends the colorway with
  lighter and darker variants once it runs out, instead of repeating colors, which matters for
  pies with more than ten slices.
- **Outlines.** `marker.line.color` and `marker.line.width` draw slice borders. A white 1–2 px
  outline separates neighbors well, especially on donuts.
- **Shape.** `hole` for donuts, `pull` to pull slices out, `rotation` and `direction` for the
  start angle and order, `sort: false` to keep the input order.
- **Text.** `textinfo`, `texttemplate`, `textposition`, `insidetextorientation`, and `textfont`,
  `insidetextfont`, `outsidetextfont`.
- **Title.** `title.text`, `title.font`, and `title.position`: `'top left'`, `'top center'` (the
  default), `'top right'`, `'middle center'` (inside the hole), `'bottom left'`, `'bottom center'`,
  or `'bottom right'`.
- Pattern fills (`marker.pattern`) come later (plan E8.10).

## Interactivity

- **Hover.** Hovering a slice shows its label. `hoverinfo` picks the parts, any of `label`,
  `text`, `value`, `percent`, and `name` joined with `+` (default: all of them). For full control,
  use `hovertemplate`, for example `'%{label}: %{value} (%{percent})<extra></extra>'`. In
  templates `%{percent}` is already formatted (`'41.7%'`); `%{value}` takes d3 formats such as
  `%{value:,.0f}`. A pie always shows the label of the slice under the pointer, whatever
  `hovermode` says.
- **Legend.** A pie adds one legend item per label, not one per trace. Clicking an item hides that
  slice and the others re-flow to fill the circle, with percents recomputed over the visible
  slices. Double-click an item to show only that label, and double-click it again to show them
  all. The hidden labels are kept in `layout.hiddenlabels`, so you can also set them yourself:

  ```ts
  await chart.relayout({ hiddenlabels: ['Other'] });
  ```

- **Events.** `hover`, `unhover`, and `click` carry Plotly-shaped points: `curveNumber`,
  `pointNumber` (the index in `values`), `label`, `value`, `percent` (a fraction, `0.25`),
  `text`, and `color`. `legendclick` and `legenddoubleclick` carry `curveNumber` and the item's
  `label`; return `false` from a listener to cancel the default hide or isolate:

  ```ts
  chart.on('click', (e) => showDetails(e.points[0].label));
  chart.on('legendclick', (e) => e.label !== 'Other'); // "Other" can't be hidden
  ```

  See the [events reference](/reference/events).

- Pies have no axes, so zoom, pan, and box or lasso selection don't apply to them.

## Performance notes

- Pies are small data: rendering cost is not the limit, readability is. Hundreds of slices draw
  fine but can't be read, so aggregate the tail into an "Other" slice first.
- Hover finds the slice from the pointer's angle and distance to the pie's center, so it doesn't
  depend on the number of slices.
- Labels are text, which is typeset asynchronously, so they can appear a frame or two after the
  slices. Outside labels also need a placement pass to avoid collisions; with many slices, use
  `textposition: 'inside'` or `'none'` and rely on hover and the legend.
- Hiding a slice from the legend is a `relayout` of `hiddenlabels`: the pie re-flows without
  re-sending the data.

## Accessibility notes

- **Screen readers:** the chart is a `<canvas>`. The DOM mirror that describes slices to assistive
  technology is not built yet (planned for M2, see the [accessibility guide](/guides/accessibility)).
  Add a caption or `aria-label` that states the main split, and a table of the values.
- **Keyboard:** there is no keyboard navigation between slices yet.
- **Color:** label slices directly (`textinfo: 'label+percent'`) so readers don't have to match
  legend colors, keep the number of slices small, and separate slices with white outlines.
  Pattern fills for print and color-blind readers come later.

## Attribute reference

See the [pie attribute reference](/reference/pie) for every attribute, its type, and its default.
The pie layout options `piecolorway`, `extendpiecolors`, `hiddenlabels`, and `grid` are in the
[layout reference](/reference/layout).

## Related charts

- [Bar](/charts/basic/bar): compare parts precisely, or the same parts across groups (stacked bars)
- [Horizontal bar](/charts/basic/horizontal-bar): many parts, sorted, with long labels
- Sunburst, treemap, and funnel area (a pie-like funnel) are planned for M3

## Plotly migration notes

- Attribute names and defaults match Plotly's `pie` trace: `values`, `labels`, `label0` /
  `dlabel`, `hole`, `pull`, `rotation`, `direction` (default `'counterclockwise'`), `sort`,
  `marker.colors`, `textinfo`, `texttemplate`, `textposition`, `insidetextorientation`, `title`,
  `scalegroup`, `domain`, `hoverinfo`, and `hovertemplate`, as do the layout attributes
  `piecolorway`, `extendpiecolors`, `hiddenlabels`, and `grid`. Plotly pie figures carry over
  unchanged.
- Legend click and double-click update `layout.hiddenlabels` as in Plotly, and the events carry
  the same fields (including `label` on legend events).
- Differences and not supported yet:
  - Hiding or showing a slice re-flows the others at once; the animated transition is planned.
    Pulled-slice transitions are planned too.
  - `marker.pattern` (pattern fills, E8.10).
  - `layout.uniformtext` (one font size for all slice labels).
  - `automargin` on pies: outside labels don't push the margins yet, so set `layout.margin`
    wide enough for them.
- Pie extrusion (`depth`, `tilt`) is a planned Holochart extension (plan E9.12).
