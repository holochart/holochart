---
title: 2D density contour
description: Bin samples along x and y and draw the counts as contour levels, filled, as lines, or over a scatter plot.
status: complete
chart: histogram2dcontour
---

# 2D density contour

## Overview

A 2D density contour (trace type `histogram2dcontour`) bins pairs of samples like a
[2D histogram](/charts/statistical/histogram2d), then draws the binned counts as contour levels:
filled bands between levels, a smooth heatmap, or level lines. Where a 2D histogram shows cells, a
density contour shows shapes: peaks, ridges, and how many clusters there are. Its lines stay
readable on top of other traces, which makes it the usual overlay for a crowded scatter plot.

Pick a different chart when:

- the exact value of each bin matters, or you want cell labels: use a
  [2D histogram](/charts/statistical/histogram2d);
- you have few samples: contours of a sparse grid are mostly noise, so use a
  [scatter](/charts/basic/scatter);
- the values are already on a grid (one `z` per cell): use a contour plot (M4).

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

const x = [1.2, 2.4, 2.1, 3.3, 2.8, 1.9, 2.2, 3.1, 2.6, 2.0];
const y = [0.8, 1.9, 1.6, 2.9, 2.2, 1.1, 1.8, 2.5, 2.0, 1.5];

const chart = createChart(document.getElementById('chart')!, {
  data: [{ type: 'histogram2dcontour', x, y }],
});
```

By default the bands between levels are filled (`contours.coloring: 'fill'`) and outlined with
thin black lines, at up to 15 automatic levels with round values. Automatic bins get one empty bin
on each side, so the outer contours close instead of running off the grid. The colorbar shows the
bands as blocks. The live example contours two overlapping clusters at up to 12 levels:

<Example id="histogram2dcontour/filled" />

## Data format

The samples, aggregation and binning are those of the 2D histogram (see its
[data format](/charts/statistical/histogram2d#data-format)):

- `x` and `y`: the samples (numbers, dates or categories); `z` or `marker.color` with `histfunc`
  (`'count'` default, `'sum'`, `'avg'`, `'min'`, `'max'`) and `histnorm` (`'percent'`,
  `'probability'`, `'density'`, `'probability density'`).
- `nbinsx` / `nbinsy`, `xbins` / `ybins` `{ start, end, size }` and `bingroup` / `xbingroup` /
  `ybingroup` choose the bins. Contours run through the bin centers, so finer bins give more
  detailed (and noisier) contours.
- Empty bins are filled from their neighbors before contouring, as in Plotly, so gaps in the data
  don't tear holes in the levels.

### Levels

- `autocontour` (default `true`) picks the levels: at most `ncontours` (default 15) levels at
  nice round values between the smallest and largest bin value.
- `contours.start`, `contours.end` and `contours.size` set the levels explicitly. Giving both
  `start` and `end` turns `autocontour` off; without `size`, a round step is chosen from
  `ncontours`.

```ts
import { createChart } from '@mk7s/holochart';

const x = [0.1, 0.4, 0.5, 0.9, 1.2, 1.1, 1.6, 0.7, 0.3, 0.8];
const y = [0.2, 0.3, 0.8, 0.6, 1.1, 0.9, 1.4, 0.5, 0.6, 0.7];

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'histogram2dcontour',
      x,
      y,
      histnorm: 'percent',
      contours: { start: 5, end: 25, size: 5 },
    },
  ],
});
```

## Variations

### Lines with level labels

`contours.coloring: 'lines'` colors each level's line from the colorscale and fills nothing.
`contours.showlabels` writes the level along the lines, cutting the line under each label;
`labelformat` (a d3 format) and `labelfont` style the labels. Here the levels are explicit and the
lines are 1.5 px and smoothed (`line.smoothing`).

<Example id="histogram2dcontour/lines-labels" />

### Recipe: scatter + density contour overlay

Draw the points small and translucent, and overlay a `histogram2dcontour` of the same samples
with `contours.coloring: 'none'`: plain lines in one `line.color`, which stay readable where the
points pile up. With `coloring: 'none'` the contour has no colorbar and gets a legend entry
instead, drawn as its line. Contours draw below scatter traces (Plotly's layer order) whatever
their order in `data`.

<Example id="histogram2dcontour/over-scatter" />

### Heatmap coloring

`contours.coloring: 'heatmap'` draws the binned values as a smooth heatmap (bilinear
interpolation on the GPU) under the level lines, with a continuous colorbar. It is the only
coloring that takes `texttemplate` cell labels. Here light, translucent lines with level labels
mark eight levels of a three-peak mixture.

<Example id="histogram2dcontour/heatmap" />

### Filled bands without lines

With `coloring: 'fill'`, `contours.showlines: false` drops the outlines for a flat, poster-like
look (`line.dash`, such as `'dot'`, `'dash'` or `'5px,10px,2px'`, dashes them instead). This ring
of samples is normalized with `histnorm: 'probability'`, so each level is a share of all samples,
drawn at up to 20 levels in Viridis. `line.smoothing: 0` keeps the contours unsmoothed: straight
segments between grid crossings.

<Example id="histogram2dcontour/bands" />

## Styling

- **Coloring.** `contours.coloring`: `'fill'` (default: flat bands between levels), `'heatmap'`
  (a smooth heatmap under the lines), `'lines'` (lines colored by level, nothing filled) or
  `'none'` (plain lines in `line.color`).
- **Lines.** `line.color` (default black; ignored for `'lines'`), `line.width` (default 0.5 px),
  `line.dash`, and `line.smoothing` (0 to 1.3, default 1; 0 draws straight segments between grid
  crossings). `contours.showlines` hides the lines of filled contours.
- **Labels.** `contours.showlabels`, `contours.labelformat` (d3 format) and `contours.labelfont`
  (defaults to `layout.font`, colored like the lines).
- **Colorscale.** `colorscale`, `zauto`, `zmin`, `zmax`, `zmid`, `reversescale`, or a shared
  `coloraxis`. Unlike the 2D histogram, `autocolorscale` defaults to `true` here (unless you set
  `colorscale`), so the layout's sequential scale is used: the neon plasma ramp in the default
  `holochart` look. See [colors and colorscales](/fundamentals/colors-colorscales).
- **Colorbar.** `showscale` and `colorbar`. The colorbar shows blocks with hard edges at the
  levels for `'fill'`, a continuous gradient for `'heatmap'` and `'lines'`, and nothing for
  `'none'`.
- **Legend.** Like the 2D histogram, a colored contour is described by its colorbar and has no
  legend entry unless `showlegend: true`; with `coloring: 'none'` it has one by default.
- **Order.** Contours draw below bars and scatter traces in the same subplot; `zorder` changes
  that.

## Interactivity

- **Hover.** The bin under the pointer shows its center and value (`x: 2.5`, `y: 1.5`, `z: 37`),
  as in Plotly. `xhoverformat`, `yhoverformat`, `zhoverformat` and `hovertemplate` (`%{x}`,
  `%{y}`, `%{z}`) work as on the [2D histogram](/charts/statistical/histogram2d#interactivity).
  Scatter points drawn on top win the `closest` hover.
- **Events.** `hover` and `click` points carry `x`, `y`, `z` and `pointNumbers`, the indices of
  the samples in that bin:

  ```ts
  chart.on('click', (e) => console.log(e.points[0]?.z));
  ```

- **Zoom and pan.** Fills, the heatmap and unlabelled lines are in data space: zooming and panning
  only change transforms. Level labels are placed in pixels, so they are re-placed after a zoom.
- **Selection.** Box and lasso selection don't select contours.

## Performance notes

- Binning costs the same as for the [2D histogram](/charts/statistical/histogram2d#performance-notes)
  (about 10 ms per million samples). Contouring (marching squares per level, smoothing, and the
  fill regions) runs once per data or level change, and scales with the number of bins times the
  number of levels, not with the number of samples.
- Filled contours are drawn by the fill primitive, which is its own code chunk, loaded the first
  time a filled contour is shown. All bands of a trace are painted in one draw call.
- `'heatmap'` coloring uses the same GPU heatmap as the 2D histogram (one textured quad), and the
  lines of all levels are one line primitive.
- Labels are text: they are typeset asynchronously and re-placed after zooming. On very fine
  grids with many levels, leave `showlabels` off or use fewer levels.

## Accessibility notes

- **Screen readers:** the chart is a `<canvas>`; the hidden description (see the
  [accessibility guide](/guides/accessibility)) says how many samples were binned into how many
  bins and where the highest value is, and its data table lists the non-empty bins.
- **Keyboard:** there is no keyboard navigation yet.
- **Color:** level labels (`showlabels`) carry the values without relying on color. Prefer a
  sequential scale that is monotonic in lightness (the default, Viridis), and for overlays use one
  high-contrast line color (`coloring: 'none'`).

## Attribute reference

See the [histogram2dcontour attribute reference](/reference/histogram2dcontour) for every
attribute, its type, and its default. Shared color axes are under
[`coloraxis`](/reference/layout#coloraxis) in the layout reference.

## Related charts

- [2D histogram](/charts/statistical/histogram2d): the same bins as cells, with exact values,
  gaps and cell labels
- [Scatter](/charts/basic/scatter): the individual samples; combine it with a density contour as
  in the [overlay recipe](#recipe-scatter-density-contour-overlay)
- Contour (M4): contour levels of values already on a grid

<Example id="histogram2d/basic" :height="320" />

## Plotly migration notes

- Attribute names and defaults match Plotly's `histogram2dcontour`: the sample and binning
  attributes of `histogram2d`, `autocontour`, `ncontours`, `contours.start` / `end` / `size` /
  `coloring` / `showlines` / `showlabels` / `labelfont` / `labelformat`, `line.color` / `width` /
  `dash` / `smoothing`, the colorscale attributes (with `autocolorscale` on by default) and the
  hover formats.
- Not supported: constraint contours (`contours.type: 'constraint'` with `operation` and `value`)
  and `xcalendar` / `ycalendar`.
- Differences:
  - A bin value exactly equal to a level counts as above it (Plotly: below).
  - Label placement is a simplified version of Plotly's, so labels can sit at other points along
    the lines.
  - With trace `opacity` below 1, filled contours show the band overlaps: bands are painted over
    each other, from the lowest level up.
  - For `coloring: 'lines'`, the colorbar is a continuous gradient; Plotly draws the level lines
    in it.
