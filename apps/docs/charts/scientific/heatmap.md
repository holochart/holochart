---
title: Heatmap
description: Show a grid of values as colored cells, on numeric, date, log or category axes, with optional cell labels.
status: complete
chart: heatmap
---

# Heatmap

## Overview

A heatmap draws a grid of values, one `z` per cell, as colored cells. Use it when the data is
already a matrix: a 2D field sampled on a grid, a spectrogram, a correlation matrix, activity per
weekday and hour. Color shows the overall shape; hover or cell labels give the exact values.

Holochart draws the whole grid as one textured quad: the values go into a single float texture,
and the fragment shader colors each pixel through a colorscale lookup. Zooming, panning and most
style changes only update uniforms, so grids of millions of cells stay interactive.

Pick a different chart when:

- you have samples, not values per cell: use a [2D histogram](/charts/statistical/histogram2d),
  which bins them first;
- you want level lines or bands rather than cells: use a [contour plot](/charts/scientific/contour), or a
  [2D density contour](/charts/statistical/histogram2d-contour) for samples;
- the values are colors (RGB pixels or a picture): use an [image](/charts/scientific/image);
- you start from a matrix and want sensible defaults (rows down from the top, square cells):
  [`hx.imshow`](/express/imshow) builds the heatmap for you.

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'heatmap',
      z: [
        [1, 20, 30],
        [20, 1, 60],
        [30, 60, 1],
      ],
    },
  ],
});
```

`z` is a list of rows: `z[row][column]`, with row 0 at the bottom of the y axis. Without `x` and
`y`, columns and rows sit at 0, 1, 2, …. A colorbar on the right maps values to colors. The live
example draws a 60 × 40 field on numeric cell centers:

<Example id="heatmap/basic" />

## Data format

- **`z` as a 2D array** (`z[row][column]`, rows along y). Rows can be typed arrays
  (`Float32Array`, …) and can differ in length: the grid is as wide as the longest row. Anything
  that is not a finite number or a numeric string (`null`, `NaN`, `''`) is a gap and draws
  nothing. `transpose: true` reads `z` as columns instead (`z[column][row]`).
- **`z` as a 1D array with `x` and `y` columns** (tidy data): one value per point, in any order.
  The points are placed on the grid of the sorted distinct `x` and `y` values; cells without a
  point are gaps. Only the first `min(x.length, y.length, z.length)` points are used.
- **Coordinates.** With one `x` value per column, `x` holds the cell **centers** and the edges lie
  halfway between them (the outer edges extrapolated). With one more value than columns, `x`
  holds the cell **edges**, so cells can have different widths. Without `x`, cells are `dx` wide
  and the first one is centered on `x0` (defaults 0 and 1). `y`, `y0` and `dy` work the same for
  rows. `xtype: 'scaled'` ignores a given `x` and uses `x0` / `dx`; `'array'` is the default
  when `x` is given.
- **Axis types.** Numbers, dates and categories all work, per axis:
  - **Date axes:** `x` can be date strings, or `x0` a date and `dx` a step in milliseconds.
  - **Log axes:** centers are given as plain values, and the edges between them are geometric
    means (as in Plotly), so evenly spaced centers on the log scale give evenly tall cells.
  - **Category axes:** the grid spans the axis' categories, one cell each, and each column is
    matched to its category by name. Traces that share an axis, or a `categoryarray` that
    reorders it, keep their cells under the right labels.
- A trace without a numeric cell (2D `z`), or without `x` and `y` columns (1D `z`), is hidden.
- Grids of more than 4096 × 4096 cells are not drawn (a warning is logged).

```ts
import { createChart } from '@mk7s/holochart';

// Column data: one row per measurement, in any order.
createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'heatmap',
      x: ['Mon', 'Mon', 'Tue', 'Tue', 'Wed'],
      y: [9, 10, 9, 10, 9],
      z: [12, 30, 18, 25, 22],
    },
  ],
});
```

```ts
import { createChart } from '@mk7s/holochart';

// Daily cells from x0 / dx: one column per day, one row per sensor.
createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'heatmap',
      x0: '2026-03-01',
      dx: 86_400_000,
      y: ['north', 'south'],
      z: [
        [3, 5, 4, 7],
        [6, 2, 5, 8],
      ],
    },
  ],
  layout: { xaxis: { type: 'date' } },
});
```

### Gaps

- `connectgaps: true` fills gaps from their neighbors (Plotly's iterative neighbor average), for
  a continuous field. It defaults to `true` for 1D `z` with `zsmooth`, else `false`.
- `hoverongaps` (default `true`) shows a hover label on gaps, with an empty `z`.

## Variations

### Annotated heatmap

`texttemplate` writes a label in every cell, with `%{z}`, `%{x}`, `%{y}` and `%{text}` and
optional d3 formats (`%{z:.2f}`). With the default `textfont.size: 'auto'`, labels take the
largest size at which they fit the cells, and without `textfont.color` they are black or white,
whichever contrasts with the cell. Here a correlation matrix on category axes uses a diverging
scale centered on 0 (`zmid`) and 1 px gaps (`xgap`, `ygap`):

<Example id="heatmap/annotated" />

### Uneven cells and filled gaps

Give `x` and `y` one more value than columns and rows, and they are the cell edges: cells can have
any width and height. The grid is still one texture; the shader finds the cell under each pixel
with a binary search of an edge texture. `connectgaps` fills the missing values:

<Example id="heatmap/uneven" />

### Smoothing

`zsmooth: 'best'` interpolates bilinearly between cell centers in data space, which stays exact
for uneven cells. `'fast'` interpolates by cell index; like Plotly, it is turned off on log axes
and uneven grids. Both run in the fragment shader. The two panels share one `coloraxis`:

<Example id="heatmap/smooth" :height="380" />

### Date and log axes

Daily columns from `x0` (a date) and `dx` (one day in ms), against frequency bands whose centers
grow geometrically on a log y axis. On a log axis the cell edges are geometric means of the
centers, so the bands are evenly tall:

<Example id="heatmap/dates" />

### Column data on a category axis

A 1D `z` with `x` and `y` columns, listed in any order, is placed on the grid of their distinct
values. The weekdays sit on a category axis ordered by `categoryarray`:

<Example id="heatmap/columns" />

## Styling

- **Colorscale.** `colorscale` (a name, a list of colors, or `[position, color]` stops), with the
  `z`-lettered range attributes: `zauto`, `zmin`, `zmax`, `zmid` (a symmetric automatic domain
  for diverging data) and `reversescale`. See
  [colors and colorscales](/fundamentals/colors-colorscales).
- **Default look.** In the default `holochart` template, heatmaps use the neon plasma sequential
  scale. Plotly's own default is `RdBu`, which you get with `layout.template: 'plotly-classic'`
  ([themes and templates](/customization/themes-templates)).
- **Colorbar.** `showscale` (default `true`) and `colorbar` (`title`, `tickformat`, `len`, …). To
  share one scale and one colorbar across traces, set `coloraxis: 'coloraxis'` on each and style
  `layout.coloraxis`.
- **Cells.** `xgap` / `ygap` (px of background between cells, only without `zsmooth`),
  `zsmooth` (`false`, `'fast'`, `'best'`) and trace `opacity`.
- **Labels.** `texttemplate` and `textfont` (`family`, `size` or `'auto'`, `color`, `weight`,
  `style`); the font defaults to `layout.font`. Grids of more than 65,536 cells (256 × 256) get
  no labels.
- **Legend.** `showlegend` defaults to `false`: the colorbar describes the trace.
- **Order.** Heatmaps draw below contours, bars and scatter traces in the same subplot; `zorder`
  changes that.

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'heatmap',
      z: [
        [-0.8, 0.1, 0.6],
        [0.3, -0.2, 0.9],
      ],
      colorscale: 'RdBu',
      zmid: 0,
      xgap: 2,
      ygap: 2,
      texttemplate: '%{z:+.1f}',
      colorbar: { title: { text: 'Δ' } },
    },
  ],
});
```

## Interactivity

- **Hover.** The cell under the pointer shows its center and value: `x: 2`, `y: 0.5`, `z: 37`.
  `text` or `hovertext` (2D like `z`, or one per point with column data) adds a line.
  `xhoverformat`, `yhoverformat` and `zhoverformat` format the values, and `hovertemplate` takes
  `%{x}`, `%{y}`, `%{z}`, `%{text}` and `%{customdata}` (2D like `z`):

  ```ts
  import { createChart } from '@mk7s/holochart';

  createChart(document.getElementById('chart')!, {
    data: [
      {
        type: 'heatmap',
        x: ['Mon', 'Tue', 'Wed'],
        y: ['9:00', '10:00'],
        z: [
          [12, 18, 22],
          [30, 25, 27],
        ],
        hovertemplate: '%{x} %{y}<br>%{z} visits<extra></extra>',
      },
    ],
  });
  ```

  Markers and lines drawn over the grid win the `closest` hover, as in Plotly.

- **Events.** `hover` and `click` points carry `x`, `y`, `z` and `pointNumber`: the cell as
  `[row, column]` of `z` for a 2D `z` (as in Plotly; when a category axis reorders the grid, still
  the position in your `z`, and per-cell `text`, `hovertext` and `customdata` follow it), or the
  index of the point placed in the cell for column data:

  ```ts
  chart.on('click', (e) => console.log(e.points[0]?.pointNumber, e.points[0]?.z));
  ```

- **Zoom and pan.** Drag to zoom, double-click to reset. The autorange spans the grid edge to
  edge, without padding. Cell labels move with the cells and are resized when the cells' size in
  pixels changes.
- **Selection.** Box and lasso selection don't select cells, as in Plotly.

## Performance notes

- The grid is one textured quad per trace: one float texture holds every value (with a validity
  channel for gaps), and a small lookup texture holds the colorscale. Uneven cells need no extra
  geometry: the shader binary-searches an edge texture.
- Zoom and pan only set uniforms. Restyling `colorscale` swaps the lookup texture, and `zmin`,
  `zmax`, `zmid`, `reversescale`, `zsmooth`, gaps and opacity only set uniforms: none of them
  re-uploads the values. Only new `z` or coordinates do.
- Up to 4096 × 4096 cells (16.7 million) per trace. Pass rows as `Float32Array` to keep the input
  compact. The `heatmap/large` example in the sandbox draws a 4096 × 4096 grid and measures the
  first draw and pan and zoom frame rates.
- `connectgaps` runs on the CPU in the calc step and scales with the number of gaps.
- Cell labels are text, typeset asynchronously; keep `texttemplate` for coarse grids. See the
  [performance guide](/guides/performance).

## Accessibility notes

- **Screen readers:** the chart is a `<canvas>`; the hidden description (see the
  [accessibility guide](/guides/accessibility)) gives the grid size, the value range and the cell
  with the highest value, and its data table lists the cells that have a value (x, y, z).
- **Keyboard:** there is no keyboard navigation between cells yet.
- **Color:** use a sequential scale that is monotonic in lightness (the default, Viridis,
  Cividis) so that "more" reads as "brighter", and a diverging scale with `zmid` only when the
  data has a meaningful center. Keep the colorbar visible, and for small grids put the values in
  the cells with `texttemplate`.

## Attribute reference

See the [heatmap attribute reference](/reference/heatmap) for every attribute, its type, and its
default. Shared color axes are under [`coloraxis`](/reference/layout#coloraxis) in the layout
reference.

## Related charts

- [2D histogram](/charts/statistical/histogram2d): bins samples into a grid first, drawn with the
  same GPU primitive
- [Contour](/charts/scientific/contour): level lines and bands of values on a grid
- [2D density contour](/charts/statistical/histogram2d-contour): contour levels of binned samples
- [Image](/charts/scientific/image): pixels given as colors (RGB, HSL) or a picture
- [Express `imshow`](/express/imshow): a matrix as a heatmap in one call, with facets and
  animation over extra dimensions

<Example id="express/imshow" :height="400" />

## Plotly migration notes

- Attribute names and defaults match Plotly's `heatmap`: `z`, `x`, `y`, `x0` / `dx`, `y0` / `dy`,
  `xtype` / `ytype`, `transpose`, `text`, `hovertext`, `connectgaps`, `hoverongaps`, `xgap` /
  `ygap`, `zsmooth`, the colorscale attributes, `texttemplate`, `textfont`, the hover formats and
  `hovertemplate`. Cell edges (including geometric means on log axes), column data and category
  placement follow Plotly's rules, so Plotly figures carry over.
- The default colorscale comes from the template: the neon plasma scale in the default look,
  `RdBu` with `template: 'plotly-classic'`.
- Smoothing is bilinear on the GPU in both modes. `'fast'` interpolates between cell centers by
  index (Plotly stretches an image of the cells, so edges look slightly different) and, as in
  Plotly, falls back to flat cells on log axes and uneven grids. `'best'` interpolates in data
  space. Next to a gap, only the neighbors with a value take part (Plotly extrapolates the
  missing ones).
- Not supported yet: `xperiod` / `yperiod` (period alignment), range breaks (Plotly drops the
  cells that fall on a break), and `xcalendar` / `ycalendar`. Grids larger than 4096 × 4096 cells
  are not drawn, and grids larger than 65,536 cells get no `texttemplate` labels.
