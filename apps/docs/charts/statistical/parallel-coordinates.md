---
title: Parallel coordinates
description: Compare many numeric variables at once, one vertical axis per variable and one line per row, and filter the rows by brushing the axes.
status: complete
chart: parcoords
---

# Parallel coordinates

## Overview

A parallel coordinates chart (`parcoords`) draws one vertical axis per variable (a _dimension_)
and one line per row of data across them. Each line crosses every axis at that row's value, so
rows that are alike run in bundles, correlated variables give parallel strokes between their
axes, and inversely correlated ones give crossings. It shows many variables at once, where a
scatter plot shows two.

The chart is made to be explored: drag along an axis to _brush_ a range and every line outside it
fades to grey, brush several axes to combine filters, and drag an axis label to move the axis next
to another one. Brushes are part of the figure (`constraintrange`), so they can be set in code,
read from events and kept across updates.

Parcoords is a domain trace, like [pie](/charts/basic/pie) and [table](/charts/basic/table): it
has no x or y axes and fills the area set by `domain`. All of its lines are one GPU draw call, so
100,000 rows stay interactive.

Pick a different chart when:

- the variables are categories (labels, not numbers): use
  [parallel categories](/charts/statistical/parallel-categories), which sizes bands by count;
- two variables matter most: a [scatter](/charts/basic/scatter) or a
  [2D histogram](/charts/statistical/histogram2d) shows their relation more precisely;
- readers need the exact values of a few rows: use a [table](/charts/basic/table).

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

const chart = createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'parcoords',
      dimensions: [
        { label: 'Sepal length', values: [5.1, 4.9, 6.4, 5.8, 6.3] },
        { label: 'Sepal width', values: [3.5, 3.0, 3.2, 2.7, 3.3] },
        { label: 'Petal length', values: [1.4, 1.4, 4.5, 4.1, 6.0] },
      ],
    },
  ],
  layout: { margin: { t: 64 } },
});
```

Each entry of `dimensions` is one axis, left to right; row `i` of every `values` array is one
line. Each axis spans the extent of its values, with ticks on its left and the bottom and top
values as range labels at its ends. The axis labels sit 28 px above the domain, outside it, so
give the chart a top margin (the examples use `t: 64`). The live example draws 150 flowers
measured four ways:

<Example id="parcoords/basic" />

## Data format

- `dimensions`: the axes, left to right. At most 60 are used; later ones are ignored, as in
  Plotly. A dimension without `values` (or with an empty array) is hidden.
- `dimensions[i].values`: one number per line. Plain arrays and typed arrays (`Float64Array`)
  both work. The number of lines is the length of the shortest visible dimension (and of `line.color`, when it is an array); longer arrays are cut.
- A value that is not a number (`null`, `NaN`, text) has no place on its axis: the line's
  segments to that axis are not drawn, and the line counts as outside any range brushed on it.
- `dimensions[i].range`: `[bottom, top]` in data units. Default: the extent of the values. Give
  `[high, low]` to flip the axis. When all values are equal, the axis widens by 10 % of the value
  on each side (`[-1, 1]` for zero).
- `dimensions[i].label`: the axis title. Plotly's pseudo-HTML works (`<b>`, `<sub>`, `<br>`).
- `dimensions[i].visible: false` hides an axis but keeps its place in `dimensions`, so indices
  in restyle paths stay the same.
- `line.color`: one CSS color for all lines, or one number per line, mapped through
  `line.colorscale` (see [Styling](#styling)).

### Constraint ranges

`dimensions[i].constraintrange` is the brushed interval of an axis: one `[lo, hi]`, or several
`[[lo, hi], [lo2, hi2]]` when `multiselect` is on (the default). A line is _selected_ when it lies
inside a range on every axis that has one; the others are drawn in the `unselected` style. The
ranges are cleaned the way Plotly does it:

- each pair is sorted (`[9, 3]` becomes `[3, 9]`) and invalid pairs are dropped;
- with `multiselect`, ranges are sorted and merged where they overlap or touch; without it only
  the first range is kept;
- on an ordinal axis (one with `tickvals`), both ends snap to the ticks, a quarter of the gap
  beyond them, so a range covers whole ticks.

```ts
const load = [12, 48, 73, 91];
const latency = [9, 12, 26, 41];
const throughput = [60, 110, 150, 180];
createChart(el, {
  data: [
    {
      type: 'parcoords',
      dimensions: [
        { label: 'Load (%)', values: load },
        {
          label: 'Latency (ms)',
          values: latency,
          constraintrange: [
            [8, 14],
            [24, 30],
          ],
        },
        { label: 'Throughput', values: throughput, constraintrange: [70, 140] },
      ],
    },
  ],
});
```

## Variations

### Lines colored by a value

`line.color` with one number per line maps each line through `line.colorscale`; `line.showscale`
adds a colorbar. Lines with higher values are drawn on top of lower ones, as in Plotly. Here every
car is colored by its fuel economy, and the cylinder axis is ordinal: `tickvals: [4, 6, 8]` puts
its ticks on the three values, and `range: [3.5, 8.5]` leaves room around them.

<Example id="parcoords/colorscale" />

### Brushed ranges

`constraintrange` sets brushes in the figure. The latency axis has two ranges and the throughput
axis one; only lines inside a range on both axes keep their color, and the others fade to grey.
The ranges show as magenta bars on their axes. Brush any axis to change them.

<Example id="parcoords/constraints" />

### Ordinal axes, tick text and label placement

Categories coded as numbers read better by name: `tickvals` gives the codes and `ticktext` their
names. An axis with `tickvals` is ordinal: it has no range labels, brushes snap to its ticks, and
a click on the axis selects the tick under the pointer. `tickformat` formats the ticks of numeric
axes (`'$,'`, `'d'`, `'.0%'`). `labelangle: -20` tilts the axis labels and `labelside: 'bottom'`
puts them below the axes (so this chart has a bottom margin instead of a top one).

<Example id="parcoords/ticktext" />

### 100,000 lines

All lines are one GPU line primitive, drawn in one call and colored per vertex. The chart below
has 100,000 rows across eight axes and one brushed range; brushing another axis recolors the
lines without rebuilding them. At this size the lines move to a dragged axis when it is dropped
rather than while it is dragged (see [Performance notes](#performance-notes)).

<Example id="parcoords/large" />

## Styling

| Attribute                                          | Default (schema)                | Meaning                                                                             |
| -------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| `line.color`                                       | the trace color                 | One CSS color, or one number per line through the colorscale                        |
| `line.colorscale`                                  | `'Viridis'`                     | Colorscale of numeric colors                                                        |
| `line.cmin`, `cmax`, `cmid`, `cauto`               | the colors' extent              | Color domain                                                                        |
| `line.reversescale`, `line.autocolorscale`         | `false`                         | Reverse the scale; use the layout's scale instead of `colorscale`                   |
| `line.showscale`, `line.colorbar`                  | `false`                         | Colorbar for numeric colors                                                         |
| `unselected.line.color`                            | `'#7f7f7f'`                     | Color of the lines outside the brushed ranges                                       |
| `unselected.line.opacity`                          | `'auto'`                        | `'auto'` is `max(1/255, (1/N)^(1/3))` for N lines                                   |
| `labelangle`, `labelside`                          | `0`, `'top'`                    | Rotation (degrees, clockwise) and side of the axis labels                           |
| `labelfont`, `tickfont`, `rangefont`               | `layout.font` at 1/1.2 the size | Fonts of the axis labels, the tick labels and the range labels                      |
| `dimensions[i].tickvals`, `ticktext`, `tickformat` | automatic ticks, d3-format `''` | Ticks of one axis (see [ordinal axes](#ordinal-axes-tick-text-and-label-placement)) |

- **Default look.** The default `holochart` template colors numeric `line.color` with its
  sequential neon plasma ramp (Plotly's default is Viridis), gives the colorbar the slim default
  style, and uses 9 px axis labels and 8 px tick and range labels in the theme's text colors.
  `layout.template: 'plotly-classic'` gives Plotly's look: Viridis and `layout.font` at 1/1.2 the
  size. See [Themes & templates](/customization/themes-templates#the-default-look) and
  [colors and colorscales](/fundamentals/colors-colorscales).
- **Unselected lines.** The automatic opacity gets fainter as lines are added (0.22 for 100
  lines, 0.05 for 10,000), so a dense chart with a brush still shows the selected lines. Set a
  number to fix it, or a color close to the paper to push the unselected lines back further.
- **Tick labels** get an automatic text halo (`tickfont.shadow: 'auto'`, as in Plotly), which
  keeps them readable over the lines.
- **Axes** are 1 px lines with 4 px ticks, black at 25 % opacity on light paper and white at
  25 % on dark paper. Brushed ranges are drawn as 4 px magenta bars over a paper-colored edge, as
  in Plotly.
- **Layout.** The first and last axes sit on the left and right edges of the domain, and the
  others are spaced evenly between them. Axis labels are 28 px beyond the axis end and range
  labels 10 px beyond it, both outside the domain: set `layout.margin` so they fit, and leave
  room on the left for the first axis' tick labels and on the right for a colorbar.
- `domain.x` / `domain.y` (fractions of the plot area), or `domain.row` / `domain.column` with
  `layout.grid`, place the trace; see
  [Layout, axes & subplots](/fundamentals/layout-axes-subplots#pies-and-other-domain-traces).
- Lines are 1 px wide; there is no line width attribute, as in Plotly.

## Interactivity

- **Brushing.** Each axis has a 10 px wide strip (5 px on either side of the axis line) that
  takes the pointer; the chart underneath never zooms or pans from it.
  - Drag along the strip to draw a new range. With `multiselect` the other ranges on the axis
    stay; without it the new range replaces them.
  - Drag the end of a range (its outer 10 %, or up to 8 px beyond it) to resize it, and its body
    to move it. The cursor shows which one you will grab.
  - Click a range's body to remove that range (with `multiselect`; without it the axis is
    cleared). Click elsewhere on the axis to clear all its ranges; on an ordinal axis, a click
    selects the tick zone under the pointer instead.
  - On release, ranges on ordinal axes snap to the ticks and overlapping ranges merge.
- **Brush events.** A finished brush restyles `dimensions[i].constraintrange` and emits the
  chart's `restyle` event, with `[[lo, hi]]` for one range, `[[[a, b], [c, d]]]` for several, and
  `null` when the axis was cleared. `i` is the index in `dimensions`, hidden dimensions included.
  The edit is recorded as a user edit, so `uirevision` keeps the brushes across `react`:

  ```ts
  chart.on('restyle', (e) => {
    for (const [path, value] of Object.entries(e.update)) {
      if (path.endsWith('.constraintrange')) console.log(path, value);
    }
  });

  // Set or clear a brush from code.
  chart.restyle(
    {
      'dimensions[1].constraintrange': [
        [
          [8, 14],
          [24, 30],
        ],
      ],
    },
    [0],
  );
  chart.restyle({ 'dimensions[1].constraintrange': null }, [0]);
  ```

  To know which rows are selected, test each row against the ranges of every constrained axis
  (a row is selected when it is inside one range of each).

- **Reordering axes.** Drag an axis label sideways (after 3 px of movement) to move its axis; the
  other axes make room as it passes them, and it can leave the domain by up to 45 px. On release
  the chart restyles `dimensions` with the array in the new order (`{ dimensions: [newArray] }`),
  again as a user edit. Hidden dimensions keep their positions in the array. A drop that doesn't
  change the order emits nothing.
- Like in Plotly, parcoords has no hover labels, no legend entry, and no click or selection
  events.

## Performance notes

- **One draw call.** Every row is one polyline of a single GPU line primitive, with one vertex
  per axis: rows × axes vertices in all (800,000 for the 100k-row example). Lines are drawn in
  ascending color order, so higher values end up on top without a depth pass.
- **Axis space.** Vertices are stored as (axis slot, position on the axis) and mapped to pixels by
  a transform, so resizing the chart or changing its margins only updates uniforms.
- **Brushing and colors.** A brush, a colorscale change or a restyle of the `unselected` style
  rewrites the per-vertex colors only, in one pass over the rows; the geometry is kept. The
  geometry is rebuilt when the data, an axis `range` or the axis order change. While brushing,
  the lines are recolored at most once per animation frame; at 100,000 rows × 8 axes a recolor
  costs roughly 20–40 ms of CPU time (selection, colors and their upload), so brushing that many
  lines runs at about 25–50 frames per second.
- **Dragging an axis.** While an axis is dragged, the lines follow it live up to about 400,000
  vertices (50,000 rows over 8 axes); beyond that the axes and labels move live and the lines
  follow on drop.
- Pass `Float64Array` values for large data; `calc` keeps one `Float32Array` of axis positions
  per dimension. See the [performance guide](/guides/performance).

## Accessibility notes

- **Screen readers:** the chart's hidden description (see the
  [accessibility guide](/guides/accessibility#the-hidden-description)) summarizes the trace: how
  many lines across how many axes, each axis with its range, and, when axes are brushed, the
  brushed ranges and how many lines they select (for example "Brushed: Latency (ms) 8 to 14 or
  24 to 30; … of 600 lines selected"). Its data table lists the first rows, one column per axis in display
  order, plus the color value for numeric `line.color` and a Selected column (yes / no) when
  axes are brushed.
- **Keyboard:** there is no keyboard brushing or axis reordering yet; set `constraintrange` from
  your own controls (a form, sliders) with `chart.restyle` for a keyboard path.
- **Color:** use a sequential scale that is monotonic in lightness (the default, Viridis,
  Cividis) for numeric colors and show the colorbar. Also add the colored variable as an axis, as
  the examples do, so its values can be read without relying on color.

## Attribute reference

See the [parcoords attribute reference](/reference/parcoords) for every attribute, its type, and
its default. `layout.grid` for placing the trace by row and column is in the
[layout reference](/reference/layout).

## Related charts

- [Parallel categories](/charts/statistical/parallel-categories): the same idea for categorical
  variables, with bands sized by count instead of one line per row
- [Scatter](/charts/basic/scatter): two variables at a time, with exact positions
- [2D histogram](/charts/statistical/histogram2d): the joint distribution of two variables when
  there are too many rows to see as lines
- [Table](/charts/basic/table): the exact values of the rows, next to the chart

## Plotly migration notes

- Attribute names and defaults match Plotly's `parcoords` trace: `dimensions` (`label`, `values`,
  `range`, `constraintrange`, `multiselect`, `tickvals`, `ticktext`, `tickformat`, `visible`),
  `line` with its colorscale attributes and colorbar, `unselected.line`, `labelangle`,
  `labelside`, `labelfont`, `tickfont`, `rangefont` and `domain`. Brushing, the cleaning and
  snapping of `constraintrange`, and dragging axis labels work as in Plotly, so Plotly figures
  carry over.
- The default colorscale comes from the template: the neon plasma ramp in the default look,
  Viridis with `template: 'plotly-classic'`.
- Differences:
  - Unselected lines are drawn in the same pass as the selected ones (Plotly draws them on a
    separate layer below), so an unselected line may cross over a selected one. Their low
    automatic opacity keeps this faint.
  - Axis lines and ticks are black at 25 % on light paper and white at 25 % on dark paper
    (Plotly: always black, which vanishes on a dark page).
  - An axis whose values are all equal widens by 10 % of the value's magnitude; Plotly scales the
    value by 0.9 and 1.1, which flips the axis for negative values.
  - The `restyle` a brush emits also applies the new `constraintrange` to the figure (Plotly
    updates its data in place and only emits the event), so `chart.data` and `uirevision` see it.
  - An axis drop emits `restyle` only when the order changed.
- Not supported yet:
  - The snap and axis-drop transitions: brushes snap and dropped axes land at once.
  - `line.coloraxis` (a shared `layout.coloraxis`) and `dimensiondefaults` in templates.
  - Line widths other than 1 px.
