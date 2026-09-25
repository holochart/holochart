---
title: Parallel categories
description: Show how samples split across several categorical variables, as columns of category bands joined by paths sized by count.
status: complete
chart: parcats
---

# Parallel categories

## Overview

A parallel categories chart (`parcats`) shows several categorical variables side by side. Each
variable (a _dimension_) is a column of category bands, sized by how many samples fall in each
category, and a _path_ joins the categories of every combination that occurs, as wide as its
count. It answers questions like "of the passengers in third class, how many were adults, and how
many of those survived?" at a glance, and hovering gives the exact counts and probabilities.

Paths can be colored by a variable (`line.color`), which splits them by color and keeps each color
together inside the bands, so the chart also shows how an outcome is distributed across all
combinations. Categories and dimensions can be reordered by dragging.

Parcats is a domain trace, like [pie](/charts/basic/pie): it has no axes and fills the area set
by `domain`.

Pick a different chart when:

- the variables are numbers with many distinct values: use
  [parallel coordinates](/charts/statistical/parallel-coordinates), with one line per row and
  brushable axes;
- there is only one categorical variable: use a [bar chart](/charts/basic/bar) or a
  [pie](/charts/basic/pie);
- there are two categorical variables and you want the count of every pair: a
  [2D histogram](/charts/statistical/histogram2d) with category axes shows it as a grid;
- the flows have their own values between named stages (a funnel, an energy balance): use a
  Sankey diagram (M5).

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

const chart = createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'parcats',
      dimensions: [
        { label: 'Hair', values: ['Black', 'Black', 'Brown', 'Brown', 'Red'] },
        { label: 'Eye', values: ['Brown', 'Brown', 'Brown', 'Blue', 'Blue'] },
        { label: 'Sex', values: ['Female', 'Male', 'Female', 'Male', 'Male'] },
      ],
    },
  ],
});
```

Each entry of `dimensions` is one column, left to right; entry `i` of every `values` array
belongs to sample `i`. Categories are listed in order of first appearance, top to bottom, and each
path is one combination of categories (Black, Brown, Female), drawn from band to band. Hover a
band or a path for its count and probability. The live example has eight people:

<Example id="parcats/basic" />

## Data format

- `dimensions`: the columns. A dimension without `values` (or with an empty array) is hidden, and
  a trace without a visible dimension is not drawn.
- `dimensions[i].values`: the category of each sample, as strings or numbers. Values are compared
  as text, so `1` and `'1'` are the same category. The number of samples is the length of the
  shortest visible dimension (and of `line.color`, when it is an array).
- `counts`: the weight of each sample: one number for all samples (default `1`), or one per
  sample; a shorter array repeats. Use it for aggregated data, with one entry per combination and
  its count in `counts`. Counts of 0, negative or non-numeric weigh nothing.
- `dimensions[i].categoryorder`: the order of the categories, top to bottom:
  - `'trace'`: order of first appearance in `values`;
  - `'category ascending'` / `'category descending'`: sorted, numerically when every category is a
    number, else as text;
  - `'array'`: the order of `categoryarray`, then unlisted values in order of appearance.

  The default is `'array'` when `categoryarray` is a non-empty array, else `'trace'`.

- `dimensions[i].categoryarray` and `ticktext`: the category order, and one label per entry
  (`categoryorder: 'array'` only). Without `ticktext`, a category is labeled with its value. A
  category in `categoryarray` that no sample has (count 0) takes no space.
- `dimensions[i].displayindex`: the column's position, left to right. It defaults to the
  dimension's index and is used only when the visible dimensions' values are exactly 0 … n − 1;
  otherwise the columns keep the order of `dimensions`.
- `dimensions[i].visible: false` hides a column but keeps its place in `dimensions`.

```ts
// Aggregated rows: one per combination, with its count.
createChart(el, {
  data: [
    {
      type: 'parcats',
      counts: [118, 57, 4, 140],
      dimensions: [
        { label: 'Sex', values: ['Male', 'Male', 'Female', 'Female'] },
        { label: 'Survived', values: ['No', 'Yes', 'No', 'Yes'], categoryarray: ['Yes', 'No'] },
      ],
    },
  ],
});
```

## Variations

### Aggregated data with counts

With `counts`, each row of the dimensions stands for a group of samples: the 2,201 people aboard
the Titanic take 32 rows here. `categoryarray` fixes the order of the classes, the age groups and
the outcome. Rows with a count of 0 add nothing.

<Example id="parcats/counts" />

### Curved paths and category labels

`line.shape: 'hspline'` draws each path between two columns as a horizontal S-curve instead of a
straight ribbon, which is easier to follow when many paths cross. Answers coded 1 to 5 are shown
by name with `categoryarray` and `ticktext`, which also puts "Excellent" at the top.

<Example id="parcats/hspline" />

### Paths colored by an outcome

`line.color` with one number per sample colors the paths through `line.colorscale`; samples with
different colors form separate paths even when their categories are the same. `bundlecolors`
(on by default) keeps paths of one color together inside every band, so each band is split into
colored segments. With `hoveron: 'color'`, hovering a band highlights only the paths of the
hovered color and shows conditional probabilities.

<Example id="parcats/colored" />

### Freeform arrangement and path order

`arrangement: 'freeform'` lets a dragged category band move its whole column sideways as well as
up and down. `displayindex` sets the column order (here the last dimension is shown first), and
`sortpaths: 'backward'` stacks the paths inside each band by the categories of the columns from
the right instead of from the left. The paths are curved and have one plain color.

<Example id="parcats/freeform" />

## Styling

| Attribute                                | Default (schema)                | Meaning                                                              |
| ---------------------------------------- | ------------------------------- | -------------------------------------------------------------------- |
| `line.color`                             | the trace color                 | One CSS color, or one number per sample through the colorscale       |
| `line.colorscale`, `line.autocolorscale` | automatic                       | Colorscale of numeric colors; automatic unless `colorscale` is given |
| `line.cmin`, `cmax`, `cmid`, `cauto`     | the colors' extent              | Color domain                                                         |
| `line.showscale`, `line.colorbar`        | `false`                         | Colorbar for numeric colors                                          |
| `line.shape`                             | `'linear'`                      | `'linear'` ribbons or `'hspline'` S-curves                           |
| `bundlecolors`                           | `true`                          | Group paths of one color together inside each band                   |
| `sortpaths`                              | `'forward'`                     | Stack paths by the columns from the left, or `'backward'`            |
| `labelfont`                              | `layout.font`                   | Font of the dimension labels                                         |
| `tickfont`                               | `layout.font` at 1/1.2 the size | Font of the category labels                                          |

- **Colors.** Without a `colorscale`, numeric colors use the layout's automatic colorscales:
  `layout.colorscale.sequential` for non-negative values, `sequentialminus` for negative ones and
  `diverging` for values of both signs. In the default look, the sequential one is the neon
  plasma ramp. Paths are drawn at 60 % opacity over each other, in ascending color order, so the
  paths with the highest values are on top; the bands show the path colors at full opacity. See
  [colors and colorscales](/fundamentals/colors-colorscales).
- **Default look.** The default `holochart` template uses 9 px dimension labels and 8 px category
  labels in the theme's text color and the slim default colorbar. See
  [Themes & templates](/customization/themes-templates#the-default-look).
- **Layout.** Bands are 16 px wide, with 40 px left for category labels on both sides of the
  domain, so the first and last columns sit 40 px inside its edges and the others are spaced
  evenly between them. Categories are 8 px apart and sized by count on one scale for all columns;
  a column with fewer categories is centered vertically. Category labels are drawn left of their
  band (right of it in the last column) with a paper-colored halo, and the dimension label above
  the top band. Leave a top margin for the dimension labels.
- **Outlines.** Category bands have a 1 px outline, black on light paper and white on dark paper.
- `domain.x` / `domain.y`, or `domain.row` / `domain.column` with `layout.grid`, place the trace;
  see [Layout, axes & subplots](/fundamentals/layout-axes-subplots#pies-and-other-domain-traces).

## Interactivity

- **Hover.** The pointer over a path shows its count and its probability (its share of the total
  count), at the middle of the path in that gap, in the path's color. Over a category band, what
  it shows depends on `hoveron`:
  - `'category'` (default): the category's count and probability, `P(category)`; its paths are
    highlighted and its outline gets thicker;
  - `'color'`: the colored segment under the pointer: its count, `P(color ∩ category)`,
    `P(category | color)` and `P(color | category)`; only the paths of that color in the
    category are highlighted;
  - `'dimension'`: one label per category of the column.

  Highlighted paths are drawn above the others at 80 % opacity. `hoverinfo` picks the fields
  (`'count'`, `'probability'`, `'count+probability'`); `'none'` keeps the highlighting without
  labels and `'skip'` turns hover off.

- **Templates.** `line.hovertemplate` formats the path labels with `%{count}` and
  `%{probability}`. The trace's `hovertemplate` formats the category labels with `%{count}`,
  `%{probability}` and `%{category}`, plus `%{categorycount}`, `%{colorcount}` and
  `%{bandcolorcount}` with `hoveron: 'color'`. When it is set, the trace's `hovertemplate` also
  formats the path labels, over `line.hovertemplate`, so keep to `%{count}` and `%{probability}`
  there if paths should show them (a missing field is shown as `-`):

  ```ts
  const dimensions = [
    { label: 'Plan', values: ['free', 'pro', 'pro', 'free'] },
    { label: 'Churned', values: ['yes', 'no', 'no', 'no'] },
  ];
  createChart(el, {
    data: [
      {
        type: 'parcats',
        line: { hovertemplate: '%{count} samples (%{probability:.0%})<extra></extra>' },
        dimensions,
      },
    ],
  });
  ```

- **Events.** `hover` and `click` points carry the same fields (`count`, `probability`,
  `category`, …), `pointNumber` (the first sample) and `pointNumbers`, the indices of all the
  samples in the path, category or colored segment, for drill-down:

  ```ts
  chart.on('click', (e) => console.log(e.points[0]?.pointNumbers?.length, 'samples'));
  ```

  A press on a category band starts a drag, so clicking a band doesn't emit `click`; clicking a
  path does.

- **Reordering.** With `arrangement: 'perpendicular'` (default), drag a category band up or down
  to reorder the categories of its column, and drag a column elsewhere (between its bands, or by
  its label) sideways to reorder the columns. The dragged element swaps places with a neighbor
  once it passes the neighbor's middle (categories) or edge (columns). With `'freeform'`, a dragged
  band also moves its column sideways; with `'fixed'`, nothing can be dragged.
- **Reorder events.** On release the chart restyles the trace and emits `restyle`, recorded as a
  user edit so `uirevision` keeps it across `react`: a category drag sets
  `dimensions[i].categoryarray`, `ticktext` and `categoryorder: 'array'` of that dimension, and a
  column drag sets `dimensions[i].displayindex` of every visible dimension.

  ```ts
  chart.on('restyle', (e) => {
    const moved = Object.keys(e.update).filter((k) => k.endsWith('.displayindex'));
    if (moved.length)
      console.log(
        'new column order',
        moved.map((k) => e.update[k]),
      );
  });
  ```

- Like in Plotly, parcats has no legend entry and no selection events.

## Performance notes

- **Paths, not samples.** Samples are aggregated into paths in `calc`, so drawing and hovering
  cost grows with the number of distinct combinations (times colors), not with the number of
  samples. Aggregate large data yourself and pass `counts` to skip the per-sample work.
- **Rendering.** All path ribbons are one fill primitive, one polygon per path (`hspline` curves
  are flattened to 12 segments per gap); its triangulation code is loaded on first use. Hovered
  paths are a second small fill drawn above, the bands and category outlines are instanced
  rects, and all labels are one text primitive.
- **Updates.** Hover only recolors the paths and redraws the few highlighted ones; a drag or a
  resize lays the trace out again on the CPU. Many continuous `line.color` values make many
  paths: bin them into a few levels when the chart should stay light.
- See the [performance guide](/guides/performance).

## Accessibility notes

- **Screen readers:** the chart's hidden description (see the
  [accessibility guide](/guides/accessibility#the-hidden-description)) names the dimensions and
  gives the number of paths and the total count. Its data table has one row per path (the first
  rows for large charts): its category in each dimension, in display order, its count and, for
  numeric `line.color`, its color value.
- **Keyboard:** there is no keyboard navigation or reordering yet; the description table is the
  keyboard-accessible way to read the counts.
- **Color:** paths of different colors overlap at 60 % opacity, so pick two to four well
  separated colors for an outcome (as in the colored example) rather than a continuous scale, and
  say in the title or a legend annotation what each color means.

## Attribute reference

See the [parcats attribute reference](/reference/parcats) for every attribute, its type, and its
default. `layout.grid` for placing the trace by row and column is in the
[layout reference](/reference/layout).

## Related charts

- [Parallel coordinates](/charts/statistical/parallel-coordinates): the same idea for numeric
  variables, one line per row with brushable axes
- [Bar](/charts/basic/bar): counts of one categorical variable, or two with stacked or grouped
  bars
- [2D histogram](/charts/statistical/histogram2d): counts of every pair of two variables, as a grid
- [Pie](/charts/basic/pie): shares of a single categorical variable

## Plotly migration notes

- Attribute names and defaults match Plotly's `parcats` trace: `dimensions` (`label`, `values`,
  `categoryorder`, `categoryarray`, `ticktext`, `displayindex`, `visible`), `counts`, `line`
  (`color` with its colorscale attributes and colorbar, `shape`, `hovertemplate`), `arrangement`,
  `bundlecolors`, `sortpaths`, `hoveron`, `hoverinfo`, `hovertemplate`, `labelfont`, `tickfont`
  and `domain`. The layout (band width, label pad, category spacing), the path order, the hover
  texts and the drag restyles follow Plotly's, so Plotly figures carry over.
- Differences:
  - A trace-level `hovertemplate`, when set, also applies to path hovers, over
    `line.hovertemplate` (Plotly uses only `line.hovertemplate` there).
  - Clicking a category band doesn't emit the chart's `click` event; clicking a path does.
  - Hover labels use the chart's hover-label style rather than Plotly's monospace labels.
  - Category outlines are white on dark paper (Plotly: always black), and category labels have
    a halo in the paper color.
  - Categories with a count of 0 take no space.
  - The cursor doesn't change over bands.
- Not supported yet:
  - The drag transitions: dropped categories and columns land at once.
  - Raising the hovered band above the others.
  - Strokes around bands and paths.
