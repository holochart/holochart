---
title: 2D histogram
description: Bin samples along x and y and show the count (or an aggregate) of each cell as a heatmap.
status: complete
chart: histogram2d
---

# 2D histogram

## Overview

A 2D histogram takes pairs of samples (`x`, `y`), bins them along both axes, and colors each cell
by how many samples fell in it, or by an aggregate of a third value. It shows the joint
distribution of two variables: where they cluster, how they correlate, and where the outliers
are, even when a scatter plot of the same points would be one solid blob.

Holochart bins the samples on the CPU and draws the grid as one textured quad with a colorscale
lookup, so large grids stay cheap and zooming or panning only updates uniforms.

Pick a different chart when:

- you have a few hundred points and each one matters: use a [scatter](/charts/basic/scatter);
- you want smooth density levels rather than cells, or an overlay on top of points: use a
  [2D density contour](/charts/statistical/histogram2d-contour);
- the values are already on a grid (one `z` per cell, not samples): use a heatmap (M4);
- only one variable matters: use a histogram.

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

const x = [1.2, 2.4, 2.1, 3.3, 2.8, 1.9, 2.2, 3.1];
const y = [0.8, 1.9, 1.6, 2.9, 2.2, 1.1, 1.8, 2.5];

const chart = createChart(document.getElementById('chart')!, {
  data: [{ type: 'histogram2d', x, y }],
});
```

Without bin settings, Holochart picks bins like Plotly: a nice round size (1, 2 or 5 × 10ⁿ) from
the spread of the samples, with the size shrinking as `n^0.25` as the sample count grows. The
cells are counted, and a colorbar on the right maps counts to colors. The live example bins 4,000
correlated samples:

<Example id="histogram2d/basic" />

## Data format

- `x` and `y`: the samples, one pair per sample. Numbers, dates (date strings or ms on a date
  axis) and categories all work, independently per axis. Only the first `min(x.length,
y.length)` pairs are used; a trace without both is hidden.
- A sample with a missing or non-numeric coordinate (`null`, `NaN`) falls in no bin.
- `z` (or `marker.color` when there is no `z`): one value per sample, aggregated per cell by
  `histfunc`. Without either, cells are counted.
- `histfunc`: `'count'` (default), or `'sum'`, `'avg'`, `'min'` and `'max'` of the `z` values in
  each cell. Empty cells of `avg`, `min` and `max` have no value and draw nothing.
- `histnorm`: `''` (raw values), `'percent'` or `'probability'` (share of the total),
  `'density'` (value divided by the cell area) or `'probability density'` (both: the grid
  integrates to 1).

```ts
import { createChart } from '@mk7s/holochart';

// Mean delivery time (z) per distance and parcel weight bin.
const distance = [3, 12, 7, 25, 18, 4, 30, 9];
const weight = [1.2, 0.4, 3.1, 2.2, 0.8, 4.5, 1.9, 2.7];
const minutes = [22, 41, 35, 70, 52, 30, 85, 38];

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'histogram2d',
      x: distance,
      y: weight,
      z: minutes,
      histfunc: 'avg',
      xbins: { size: 10 },
      colorbar: { title: { text: 'avg minutes' } },
    },
  ],
});
```

### Bins

- `nbinsx` / `nbinsy`: the maximum number of bins per axis. The size is still rounded to a nice
  value, so you may get fewer bins than asked.
- `xbins` / `ybins` `{ start, end, size }`: explicit bins. Any part you leave out is automatic.
  On a date axis `size` is in milliseconds, or `'M<n>'` for calendar months (`'M1'` monthly,
  `'M3'` quarterly, `'M12'` yearly); `start` and `end` are dates. On a category axis there is one
  bin per category by default, and `size` counts categories.
- `bingroup`: traces with the same `bingroup` get the same x bins and the same y bins, so their
  cells line up (for example two panels you want to compare cell by cell). `xbingroup` and
  `ybingroup` share one direction only, and also pair with 1D `histogram` traces of the same
  `bingroup`, which keeps marginal histograms aligned with the grid.

```ts
import { createChart } from '@mk7s/holochart';

const before = { x: [1, 2, 2, 3, 4, 4, 5], y: [2, 3, 3, 4, 4, 5, 6] };
const after = { x: [2, 3, 3, 4, 5, 6, 6], y: [1, 2, 3, 3, 4, 4, 5] };

// Shared bins: the cells of both panels have the same edges.
createChart(document.getElementById('chart')!, {
  data: [
    { type: 'histogram2d', ...before, bingroup: 'ab', coloraxis: 'coloraxis' },
    { type: 'histogram2d', ...after, bingroup: 'ab', coloraxis: 'coloraxis', xaxis: 'x2' },
  ],
  layout: { xaxis: { domain: [0, 0.48] }, xaxis2: { domain: [0.52, 1] } },
});
```

## Variations

### Cell labels on a category axis

`texttemplate` writes a label in every non-empty cell, with `%{z}`, `%{x}` and `%{y}` (bin centers)
and optional d3 formats (`%{z:.1f}`). With the default `textfont.size: 'auto'`, labels take the
largest size at which they fit the cells, and without `textfont.color` they are black or white,
whichever contrasts with the cell. Here x is a category axis (one bin per weekday) and y uses
explicit 3-hour bins.

<Example id="histogram2d/texttemplate" />

### Gaps between cells

`xgap` and `ygap` leave that many pixels of background between cells, a tiled look that suits
coarse grids. `nbinsx` / `nbinsy` cap the number of bins, and `colorscale` replaces the default
scale. Gaps only apply to flat cells (`zsmooth: false`).

<Example id="histogram2d/gaps" />

### Smoothing

`zsmooth: 'best'` interpolates bilinearly between cell centers in data space, which stays exact
for uneven bins (month bins, for example); `'fast'` interpolates by cell index, which is the same
for equal bins. Both run in the fragment shader: no extra geometry, and zooming stays a uniform
update. The two panels share one `coloraxis`, so one colorbar describes both.

<Example id="histogram2d/smooth" />

### Density with a titled colorbar

`histnorm: 'probability density'` divides each cell by the total and by its area, so the grid
integrates to 1 and grids with different bin sizes compare fairly. `zhoverformat` and
`colorbar.tickformat` keep the small numbers readable.

<Example id="histogram2d/density" />

### Dates and month bins

On a date axis, month-sized bins (`'M1'`, `'M3'`, `'M12'`) follow the calendar, so every cell is
one month even though months differ in length. Pair them with `zsmooth: 'best'` if you smooth.

```ts
import { createChart } from '@mk7s/holochart';

const opened = ['2024-01-03', '2024-01-19', '2024-02-11', '2024-03-02', '2024-03-28'];
const hoursToClose = [4, 30, 12, 7, 52];

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'histogram2d',
      x: opened,
      y: hoursToClose,
      xbins: { start: '2024-01-01', end: '2024-04-01', size: 'M1' },
      ybins: { size: 12 },
    },
  ],
  layout: { xaxis: { type: 'date' } },
});
```

## Styling

- **Colorscale.** `colorscale` (a name, a list of colors, or `[position, color]` stops), with the
  `z`-lettered range attributes: `zauto`, `zmin`, `zmax`, `zmid` (a symmetric automatic domain
  for diverging data) and `reversescale`. `autocolorscale` is off by default, so `colorscale` is
  used as given. See [colors and colorscales](/fundamentals/colors-colorscales).
- **Default look.** In the default `holochart` template, 2D histograms use the neon plasma
  sequential scale, whose dark end still shows on the dark background. Plotly's own default is
  `RdBu`, which you get with `layout.template: 'plotly-classic'`
  ([themes and templates](/customization/themes-templates)).
- **Colorbar.** `showscale` (default `true`) and `colorbar` (`title`, `tickformat`, `len`, …).
  To share one scale and one colorbar across traces, set `coloraxis: 'coloraxis'` on each and
  style `layout.coloraxis`.
- **Cells.** `xgap` / `ygap` (px, flat cells only), `zsmooth` (`false`, `'fast'`, `'best'`) and
  trace `opacity`.
- **Labels.** `texttemplate` and `textfont` (`family`, `size` or `'auto'`, `color`, `weight`,
  `style`); the font defaults to `layout.font`.
- **Legend.** `showlegend` defaults to `false`: the colorbar describes the trace. Set it to `true`
  for a legend entry (a swatch of the scale's middle color).
- **Order.** Like other heatmap-like traces, a 2D histogram draws below bars and scatter traces in
  the same subplot; `zorder` changes that.

## Interactivity

- **Hover.** The cell under the pointer shows its bin ranges and value, for example `x: 0 - 4`,
  `y: 10 - 12`, `z: 37`. Ranges are rounded to the precision the bins need; on a category axis
  the category name is shown. `xhoverformat`, `yhoverformat` and `zhoverformat` format the
  values, and `hovertemplate` takes `%{x}` and `%{y}` (the range labels) and `%{z}`:

  ```ts
  import { createChart } from '@mk7s/holochart';

  createChart(document.getElementById('chart')!, {
    data: [
      {
        type: 'histogram2d',
        x: [1, 2, 2, 3, 3, 3],
        y: [4, 5, 5, 6, 6, 7],
        hovertemplate: 'size %{x}<br>latency %{y} ms<br>%{z} requests<extra></extra>',
      },
    ],
  });
  ```

  Markers and lines drawn over the grid win the `closest` hover, as in Plotly.

- **Events.** `hover` and `click` points carry `x` and `y` (the cell center), `z`, `pointNumber`
  (the cell index, row-major) and `pointNumbers`, the indices of the samples in that cell, for
  drill-down:

  ```ts
  chart.on('click', (e) => console.log(e.points[0]?.pointNumbers?.length, 'samples'));
  ```

- **Zoom and pan.** Drag to zoom, double-click to reset. The grid is not rebinned while you zoom.
- **Selection.** Box and lasso selection don't select cells, as in Plotly.

## Performance notes

- Binning runs on the CPU in the calc step. For numeric bins of equal size, finding a sample's
  bin is O(1), about 10 ms per million samples; month bins and uneven bins use a binary search.
- The grid is one textured quad per trace plus a small colorscale lookup texture, whatever the
  number of cells. Zoom and pan only set uniforms; style edits (colorscale, `zmin` / `zmax`,
  `zsmooth`, gaps, opacity) set uniforms or swap the lookup texture, with no rebinning.
- Grids of more than 4096 × 4096 cells are not drawn (a warning is logged). Pick coarser bins.
- Cell labels are text, which is typeset asynchronously; thousands of labels take longer to appear
  than the grid. Keep `texttemplate` for coarse grids.
- Aggregating samples on the GPU (for well beyond a million samples) is not implemented yet. See
  the [performance guide](/guides/performance).

## Accessibility notes

- **Screen readers:** the chart is a `<canvas>`; the hidden description (see the
  [accessibility guide](/guides/accessibility)) says how many samples were binned into how many
  bins and names the fullest cell with its bin ranges, and its data table lists the non-empty cells
  (x range, y range, value).
- **Keyboard:** there is no keyboard navigation between cells yet.
- **Color:** use a sequential scale that is monotonic in lightness (the default, Viridis, Cividis)
  so that "more" reads as "brighter" without relying on hue, and keep the colorbar visible. For
  coarse grids, `texttemplate: '%{z}'` puts the exact values in the cells.

## Attribute reference

See the [histogram2d attribute reference](/reference/histogram2d) for every attribute, its type,
and its default. Shared color axes are under [`coloraxis`](/reference/layout#coloraxis) in the
layout reference.

## Related charts

- [2D density contour](/charts/statistical/histogram2d-contour): the same binning drawn as
  contour levels, for smooth shapes and overlays on scatter plots
- [Scatter](/charts/basic/scatter): each sample as a point, for small data or outliers
- Heatmap (M4): values already on a grid

## Plotly migration notes

- Attribute names and defaults match Plotly's `histogram2d`: `x`, `y`, `z`, `marker.color`,
  `histfunc`, `histnorm`, `nbinsx` / `nbinsy`, `xbins` / `ybins`, `bingroup` / `xbingroup` /
  `ybingroup`, `xgap` / `ygap`, `zsmooth`, the colorscale attributes, `texttemplate`, `textfont`,
  the hover formats and `hovertemplate`. Automatic bins follow Plotly's rules, so Plotly figures
  carry over.
- The default colorscale comes from the template: the neon plasma scale in the default look,
  `RdBu` with `template: 'plotly-classic'`.
- `zsmooth: 'fast'` interpolates between cell centers on the GPU; Plotly's `'fast'` stretches an
  image of the cells, so edges look slightly different.
- A click point's `pointNumber` is a flat cell index (row-major) rather than Plotly's `[row, col]`
  pair; `pointNumbers` (the samples in the cell) matches.
- Not supported: selection (Plotly doesn't select 2D histogram cells either), `xcalendar` /
  `ycalendar` (non-Gregorian calendars), and grids larger than 4096 × 4096 cells.
