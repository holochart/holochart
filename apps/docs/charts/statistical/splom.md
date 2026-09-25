---
title: Scatter plot matrix
description: Plot every pair of dimensions against each other in a grid of linked scatter plots, with selection that highlights the same samples in every cell.
status: complete
chart: splom
---

# Scatter plot matrix

## Overview

A scatter plot matrix (splom) draws every pair of dimensions of a table as a scatter plot. There
is one row and one column per dimension, so the cell in row _i_ and column _j_ plots dimension _j_
(x) against dimension _i_ (y). The diagonal plots each dimension against itself. It is the quickest
way to see which of several variables are correlated, clustered or skewed, and to follow one group
of samples through every pair: a box or lasso selection in any cell highlights the same samples in
all the others.

Holochart's `splom` trace follows Plotly's. Each dimension gets an x axis (its column) and a y axis
(its row), titled with its label and laid out as a grid. The halves above and below the diagonal,
and the diagonal itself, can each be hidden. Each dimension is uploaded to the GPU once and shared by
every cell that uses it, so large matrices stay interactive.

Pick a different chart when:

- you have two or three variables: a [scatter plot](/charts/basic/scatter) with color or size
  shows them larger and with less repetition;
- you have many dimensions (a dozen or more) or many rows to follow as lines:
  parallel coordinates (`parcoords`) use one axis per dimension instead of one cell per pair;
- the variables are counts per category rather than samples: use a heatmap or grouped bars.

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

const el = document.getElementById('chart')!;
createChart(el, {
  data: [
    {
      type: 'splom',
      dimensions: [
        { label: 'height', values: [150, 162, 171, 180, 168] },
        { label: 'weight', values: [52, 60, 68, 81, 66] },
        { label: 'age', values: [23, 35, 41, 30, 52] },
      ],
    },
  ],
});
```

Each dimension is `{ label, values }`, and every dimension indexes the same samples. Below, one
trace per species gives each species its own color and legend entry. The traces share the
dimension axes:

<Example id="splom/iris" />

## Data format

- **`dimensions`**: one item per dimension, in order (row 0 on top, column 0 on the left):
  - `values`: one value per sample. Numbers, dates and categories all work, typed arrays
    included. The shortest dimension sets the sample count.
  - `label`: the default title of the dimension's axes, and the name hover labels use.
  - `visible: false` keeps the dimension's row and column but leaves them empty. A dimension
    without `values` is hidden.
  - `axis.type` (`'linear'`, `'log'`, `'date'`, `'category'`) is the default type of its axes.
    Without it the type is detected from the values. `axis.matches: true` links its x and y axes.
- **Axes**: dimension _i_ uses `xaxes[i]` and `yaxes[i]`, by default `x`, `x2`, … and `y`, `y2`, ….
  Style them like any axis (`layout.xaxis2.range`, `layout.yaxis3.type`, …). Your settings win
  over the dimension defaults.
- **Layout**: without a `layout.grid` that names cells, the axes are placed as a grid with one
  column per x axis and one row per y axis. `layout.grid.xgap` / `ygap` (0.1 by default) and
  `grid.domain` still apply.
- **Missing values**: a sample with a non-finite value in a dimension is not drawn in that
  dimension's cells. It still appears in the other cells.
- **`text`** / **`hovertext`**: text per sample, shown in hover labels.

## Variations

### Lower half only

The cells above the diagonal mirror the ones below. `showupperhalf: false` drops them, and
`diagonal.visible: false` drops the diagonal too. With both hidden, the first row and the last
column would be empty, so five dimensions take four rows and four columns. `marker.color` can hold
one color per sample:

<Example id="splom/lower-half" />

### Colored by a numeric column

Numbers in `marker.color` are mapped through the colorscale on the GPU, and `marker.showscale`
adds a colorbar. The colored column doesn't have to be one of the dimensions:

<Example id="splom/colorscale" />

### Dates, categories and log axes

Each dimension's axes take their type from its values, or from `axis.type`. `axis.matches` links a
dimension's x and y axes, so zooming its column also zooms its row. Hover labels format each value
the way its axis does:

<Example id="splom/axis-types" />

### Many dimensions

Eight dimensions make 64 cells. Each cell is one GPU draw over the two shared dimension buffers, so
the matrix costs eight uploads, whatever the number of cells. Small, translucent markers show the
density, and a smaller `layout.grid` gap leaves more room for each cell:

<Example id="splom/dense" />

## Styling

- **Markers**: `marker.color` (one color, one per sample, or numbers mapped through
  `marker.colorscale` with `cmin`, `cmax`, `cmid`, `reversescale`, `showscale`, `colorbar` and
  `coloraxis`), `marker.size` (one size, or one per sample scaled by `sizeref`, `sizemode` and
  `sizemin`), `marker.symbol`, `marker.opacity`, `marker.angle` and `marker.line.color` / `width`.
  Markers look the same in every cell.
- **Default look**: the `holochart` template draws 3 px markers without outlines and slim
  colorbars. Colors follow the colorway, one per trace.
- **Selection styles**: `selected.marker.{color, size, opacity}` and `unselected.marker.*`.
  Without them, unselected samples fade to 0.2 × their opacity.
- **Axes and grid**: every dimension axis is a regular cartesian axis (`layout.xaxisN`,
  `layout.yaxisN`), and `layout.grid` sets the gaps and the extent of the matrix.

## Interactivity

- **Hover** finds the nearest sample in the hovered cell. The label names both of the cell's
  dimensions (`sepal length: 5.1` and `petal width: 0.2`), then the sample's text, with the trace
  name beside it. `hovertemplate` gets `%{x}` and `%{y}` (the cell's two values), `%{text}`,
  `%{customdata}`, `%{marker.color}` and `%{marker.size}`. The `hover` event's point carries the
  sample index (`pointNumber`) and the cell's `x` / `y` values.
- **Selection**: a box or lasso in any cell (`dragmode: 'select'` or `'lasso'`) selects the samples
  inside it. The selection belongs to the trace, so the same samples are highlighted in every cell,
  and `selectedpoints` sets it the same way. Shift adds to the selection; a double-click clears it.
- **Zoom and pan** act on the axes of the cell under the pointer: its column's x axis and its row's
  y axis, so every cell of that column and row follows. With `axis.matches`, the dimension's other
  axis follows too.

## Performance notes

- Every dimension is converted to linear coordinates once (typed arrays go through without a
  copy of the data) and uploaded to the GPU as one float32 buffer. The per-sample style is one
  more set of buffers. A cell is one instanced draw referencing two of those buffers, so `d`
  dimensions cost `d` uploads and `d²` draw calls, independent of the sample count.
- Restyling or selecting rewrites the shared style buffers once for the whole matrix. Zooming or
  panning only changes the transform uniforms of the affected cells. Nothing is re-uploaded.
- Ten dimensions of 100,000 samples (100 cells) take about 40 ms of CPU time in calc and upload
  after warm-up; a selection takes about 10 ms. Hover and selection scan the two columns of a
  single cell (O(n), under a millisecond at 100k samples).
- The GPU draws every sample once per cell. For very large matrices, keep markers small and
  translucent, and hide the upper half (`showupperhalf: false`), which halves the draws.

## Accessibility notes

- **Screen readers**: each trace is described by its sample and dimension counts and each
  dimension's range, with a hidden table of the first samples (one column per dimension). Every
  dimension axis is listed with its title and range. See the
  [accessibility guide](/guides/accessibility).
- **Keyboard**: there is no keyboard navigation between samples yet.
- **Color**: when color encodes a class, also give each class its own trace (a legend entry to
  name it) or a different `marker.symbol`.

## Attribute reference

See the [splom attribute reference](/reference/splom), and the
[layout reference](/reference/layout) for the dimension axes (`xaxis`, `yaxis`) and `grid`.

## Related charts

- [Scatter plot](/charts/basic/scatter): one pair of variables, larger and with lines, text and
  error bars
- [Histogram](/charts/statistical/histogram): the distribution of one dimension
- [2D histogram](/charts/statistical/histogram2d): the density of one pair, for samples too many
  to draw as points

## Plotly migration notes

- Splom figures carry over. `dimensions` (`label`, `values`, `visible`, `axis.type`,
  `axis.matches`), `diagonal.visible`, `showupperhalf`, `showlowerhalf`, `xaxes` / `yaxes`,
  `marker`, `text` / `hovertext` / `hovertemplate`, `selectedpoints` and `selected` /
  `unselected` behave as in Plotly. So do the default axis layout (a grid with the axes at the
  bottom and left, or at the grid edges when the lower half or the diagonal is hidden) and the
  hidden first row and last column when a half and the diagonal are both hidden.
- Differences:
  - Without a `hovertemplate`, hover labels read `label: value` for both dimensions of the cell.
    Plotly shows `(x, y)`.
  - A dimension is converted through its x axis (else its y axis). When you give its x and y axes
    different types, the y axis reads the x axis' values, as in Plotly.
  - The `selected` event's points carry `pointNumber` but not the cell's `x` / `y` values.
- Not supported yet: `xhoverformat` / `yhoverformat` (the axes' `hoverformat` applies),
  `marker.gradient`.
