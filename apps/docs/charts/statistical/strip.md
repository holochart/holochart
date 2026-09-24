---
title: Strip plot
description: Show every observation of each group as a jittered point, with the strip helper or a box trace.
status: complete
chart: box
---

# Strip plot

## Overview

A strip plot (a jittered dot plot) draws every observation as a point at its category, spread a
little across the category so points with close values don't hide each other. Where a
[box plot](/charts/statistical/box) or a [violin](/charts/statistical/violin) summarizes, a strip
plot shows the raw data: how many observations there are, clusters, gaps and outliers. It works
best up to a few hundred points per category.

Holochart has no separate strip trace: as in plotly.py's `px.strip`, a strip plot is a `box` trace
with `boxpoints: 'all'` and an invisible box. The `strip` helper builds that figure from a table.

Pick a different chart when:

- there are thousands of observations per category: the points merge into a blob; use a
  [violin](/charts/statistical/violin) or a [box plot](/charts/statistical/box);
- both axes are numeric: that's a [scatter plot](/charts/basic/scatter).

## Minimal example

```ts
import { createChart, strip } from '@mk7s/holochart';

const figure = strip({
  data: [
    { day: 'Thu', bill: 17.2 },
    { day: 'Thu', bill: 12.5 },
    { day: 'Fri', bill: 21.0 },
    { day: 'Sat', bill: 30.1 },
    { day: 'Sat', bill: 24.4 },
  ],
  x: 'day',
  y: 'bill',
});
createChart(document.getElementById('chart')!, figure);
```

`strip` returns a plain figure (`{ data, layout }`) that you can change before passing it to
`createChart`:

<Example id="strip/basic" />

The same chart without the helper is one `box` trace:

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'box',
      x: ['Thu', 'Thu', 'Fri', 'Sat', 'Sat'],
      y: [17.2, 12.5, 21.0, 30.1, 24.4],
      boxpoints: 'all', // draw every sample
      pointpos: 0, // on the box's center line
      jitter: 0.3, // spread across 30% of the box width
      hoveron: 'points',
      fillcolor: 'rgba(0,0,0,0)', // invisible box
      line: { width: 0 },
    },
  ],
  layout: { boxmode: 'group' },
});
```

## Data format

With the helper, `data` is a table: an array of row objects, or an object of equally long
columns (`{ day: [...], bill: [...] }`). The options name the columns:

| Option                   | Meaning                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `x`, `y`                 | Category and value columns. `x` categorical and `y` numeric give vertical strips; the other way round, horizontal |
| `orientation`            | `'v'` or `'h'`, to override the inference (px's rule: horizontal when `x` is numeric and `y` is not)              |
| `color`                  | Group by this column: one trace, color and legend item per value                                                  |
| `stripmode`              | `'group'` (default): groups side by side in each category; `'overlay'`: on one strip                              |
| `jitter`                 | Spread of the points, 0–1 of the strip width (default 0.3). A Holochart option                                    |
| `hoverName`, `hoverData` | A bold hover title, and extra hover lines (passed as `customdata`)                                                |
| `labels`                 | Display names of columns, for hover lines, the legend title and the axis titles                                   |
| `colorDiscreteMap`       | Fixed colors per `color` value                                                                                    |
| `colorDiscreteSequence`  | Colors for the other values, in order (default: the template's colorway)                                          |
| `categoryOrders`         | Orders per column: `{ day: [...] }` orders the categories, `{ [color]: [...] }` the traces and the legend         |
| `title`                  | Figure title                                                                                                      |

The points are the samples of a box trace, so every [box data rule](/charts/statistical/box#data-format)
applies: category, numeric and date positions, values that aren't numbers are skipped.

## Variations

### Colored groups

`color` makes one trace per value. With `stripmode: 'group'` each value gets its own strip within
each category (the traces share an `alignmentgroup` and each has its own `offsetgroup`), and the
legend shows each group's marker.

<Example id="strip/grouped" />

### Horizontal strips

A numeric `x` and a categorical `y` give horizontal strips. `hoverName` and `hoverData` add
columns to the hover label; a wider `jitter` spreads dense strips further.

<Example id="strip/horizontal" />

### Overlaid groups

`stripmode: 'overlay'` draws all groups of a category on one strip, so they mix;
`colorDiscreteMap` fixes their colors.

<Example id="strip/overlay" />

### Over box plots

The figure is plain data: add a `box` trace of the same samples first (under the points) and the
boxes summarize while the points show every observation. That box hides its own points
(`boxpoints: false`) and doesn't hover (`hoverinfo: 'skip'`).

<Example id="strip/with-box" />

### A box with all points

A regular box plot can also show every sample beside the box (`boxpoints: 'all'` with a negative
`pointpos`):

<Example id="box/points" />

## Styling

- **Points.** `marker.size` (default 6), `symbol`, `opacity` and `marker.line.*` on the traces the
  helper returns (`figure.data[0].marker = { size: 4, opacity: 0.8 }`).
- **Colors.** Without `color`, points take the first colorway color. With `color`, each group
  takes the next colorway color unless `colorDiscreteMap` or `colorDiscreteSequence` sets it.
- **Strip width.** The strips are invisible boxes: `layout.boxgap`, `boxgroupgap` and a trace's
  `width` set how much room the jitter has; `jitter` sets how much of it the points use.
- **Beeswarm.** Points are jittered randomly (repeatably: the same data always gives the same
  picture); a beeswarm layout that avoids overlaps is not available yet.

## Interactivity

- **Hover.** The helper sets `hoveron: 'points'`, so each point shows its own label from the
  helper's `hovertemplate`: the group, the category and the value (`day=Sat<br>bill=30.1`), like
  `px.strip`. `%{x}` is the category, not the jittered position.
- **Selection.** Box and lasso selection pick points (their data indices); `selected` and
  `unselected` style them.
- **Legend.** With `color`, a legend click hides a group and a double-click isolates it.

## Performance notes

- All points of a trace are one instanced marker set: tens of thousands of points stay
  interactive. Jitter is computed in calc, so zooming only moves the camera.
- Beyond a few hundred points per category the strips saturate; summarize with a box or a violin.

## Accessibility notes

- **Screen readers:** each strip trace is described as a box trace (its categories, sample counts
  and medians) with a hidden table of per-category statistics. See the
  [accessibility guide](/guides/accessibility).
- **Keyboard:** there is no keyboard navigation between points yet.
- **Color:** with `color` groups side by side (`stripmode: 'group'`), groups also differ by
  position; in `overlay` mode they differ by color only, so consider `marker.symbol` per trace.

## Attribute reference

A strip plot is a `box` trace: see the [box attribute reference](/reference/box) (`boxpoints`,
`jitter`, `pointpos`, `marker`) and the [layout reference](/reference/layout) for `boxmode`.

## Related charts

- [Box plot](/charts/statistical/box): the same trace with its box drawn
- [Violin](/charts/statistical/violin): the density shape of many observations
- [Scatter](/charts/basic/scatter): points on two numeric axes

## Plotly migration notes

- `strip` follows `px.strip` with camelCase options (`color_discrete_map` → `colorDiscreteMap`,
  `category_orders` → `categoryOrders`, `hover_name` → `hoverName`, …) and a table given as rows or
  columns instead of a DataFrame. It returns a figure object, not a `Figure` class. Differences:
  - The box outline is removed with `line.width: 0` instead of a transparent line color, so the
    points keep the colorway color without the helper writing colors into every trace.
  - `jitter` is an option (px has none; it keeps Plotly's default 0.3).
  - Not supported: `facet_row` / `facet_col`, `animation_frame`, `log_x` / `log_y`,
    `range_x` / `range_y`, `width` / `height` / `template` (set them on the returned figure).
- Plotly strip figures (box traces with `boxpoints: 'all'` and transparent colors) carry over
  unchanged; the legend shows a marker for them, as in Plotly.
- Beeswarm layouts (plan E10.6, `jittermode: 'beeswarm'`) are not implemented yet.
