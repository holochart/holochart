---
title: Contour plot
description: Draw a grid of values as level lines, filled bands or a smooth heatmap, with level labels, uneven grids, gaps and constraint regions.
status: complete
chart: contour
---

# Contour plot

## Overview

A contour plot (trace type `contour`) draws a grid of values, such as a measured field, a
simulation or a function of two variables, as level lines: every point on a line has the same
value, like the height lines of a map. Filled bands between the lines show where the values are
high or low, and closely spaced lines show where they change fast. Where a heatmap of the same
grid only shows a color gradient, contours show shapes: peaks, ridges and saddles, and they stay
readable on top of other traces.

Pick a different chart when:

- the exact value of every cell matters, or the grid is coarse and blocky: use a
  [heatmap](/charts/scientific/heatmap);
- you have samples rather than values on a grid: bin them into a
  [2D density contour](/charts/statistical/histogram2d-contour);
- the values have no spatial order along x and y: a table or a [bar chart](/charts/basic/bar)
  is clearer.

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'contour',
      z: [
        [1, 2, 3, 2, 1],
        [2, 4, 6, 4, 2],
        [3, 6, 9, 6, 3],
        [2, 4, 6, 4, 2],
        [1, 2, 3, 2, 1],
      ],
    },
  ],
});
```

`z` is a 2D array: one row per y, one column per x. By default the bands between levels are
filled (`contours.coloring: 'fill'`) and outlined with thin black lines, at up to 15 automatic
levels with round values, and a colorbar shows the bands as blocks. The live example contours two
bumps and a dip on a 61 × 41 grid:

<Example id="contour/basic" />

## Data format

- `z`: the values, as a 2D array `z[row][column]` (rows along y). Non-numeric entries (`null`,
  `NaN`, strings that aren't numbers) are gaps. `transpose: true` reads `z[column][row]` instead.
- `x` and `y`: the coordinates of the columns and rows: numbers, dates or categories. They don't
  have to be evenly spaced. Without them, columns are at `x0`, `x0 + dx`, … (defaults 0 and 1),
  and rows at `y0`, `y0 + dy`, …; `xtype: 'scaled'` ignores `x`.
- Column data: a 1D `z` with 1D `x` and `y` of the same length places each value at its x and y,
  on the grid of their distinct values.
- Contours run between the first and last grid point, which is also what the axes autorange to.
- **Gaps** are filled from their neighbours before contouring, as in Plotly. With
  `connectgaps: false` (the default for a 2D `z`) the drawing is then clipped to the data, leaving
  a hole around each gap; `connectgaps: true` (the default for column data) draws across them.

### Levels

- `autocontour` (default `true`) picks the levels: at most `ncontours` (default 15) levels at
  nice round values between the smallest and largest value (or `zmin` / `zmax` when set).
- `contours.start`, `contours.end` and `contours.size` set the levels explicitly. Giving both
  `start` and `end` turns `autocontour` off; without `size`, a round step is chosen from
  `ncontours`.

```ts
import { createChart } from '@mk7s/holochart';

const x = [0, 1, 2, 4, 8];
const y = [0, 0.5, 1, 2];
const z = y.map((b) => x.map((a) => a * a + 3 * b));

createChart(document.getElementById('chart')!, {
  data: [{ type: 'contour', x, y, z, contours: { start: 5, end: 60, size: 5 } }],
});
```

## Variations

### Lines with level labels

`contours.coloring: 'lines'` colors each level's line from the colorscale and fills nothing.
`contours.showlabels` writes the level along the lines; `labelformat` (a d3 format, here `.2f`)
and `labelfont` style the labels. Labels are placed like Plotly places them: preferably
horizontal, away from the plot edges and from each other, about one per long line, and the line
breaks under each label.

<Example id="contour/lines-labels" />

### Heatmap coloring

`contours.coloring: 'heatmap'` draws the grid as a smooth heatmap (bilinear interpolation between
grid points, on the GPU) under the level lines, with a continuous colorbar. It is the only
coloring that takes `texttemplate` labels at the grid points. Here light, translucent lines with
labels mark ten levels of two interfering waves on a coarse 31 × 21 grid.

<Example id="contour/heatmap" />

### Constraint contours

`contours.type: 'constraint'` draws the boundary where the values meet a constraint and shades
the region where it holds. `contours.operation` is the comparison (`'='`, `'<'`, `'<='`, `'>'`,
`'>='`) and `contours.value` the value. The shading is `fillcolor` (default: the line color, or
the trace's color, at half opacity) and the boundary a 2 px line. Several constraint traces over
the objective's level lines show a feasible region, where all the shadings overlap:

<Example id="contour/constraint" />

Interval operations shade inside (`'[]'`, `'()'`, `'[)'`, `'(]'`) or outside (`'][', ')(', '](',
')['`) a `value: [lower, upper]`; open and closed ends draw the same. `'='` draws the single level
as a line and shades nothing. Constraint contours have no colorbar, and appear in the legend.

<Example id="contour/constraint-interval" />

### Uneven grids

The grid can be spaced unevenly in either direction: marching squares runs on the grid cells and
every crossing is placed by interpolating between the actual coordinates, so levels land where
the data puts them. Here a resonance peak is sampled densely near the peak; the grid points are
drawn on top as markers.

<Example id="contour/uneven-grid" />

### Smoothing

`line.smoothing` (0 to 1.3, default 1) rounds the lines and the fills with Plotly's spline
smoothing. `0` draws straight segments between grid crossings, which shows the grid on coarse
data (left); 1.3 is the smoothest (right).

<Example id="contour/smoothing" />

### Gaps

`null` values leave holes with `connectgaps: false`: each hole reaches 90% of the way from a
missing point to its neighbours (Plotly's clip), and lines and labels stop at its edge.

<Example id="contour/gaps" />

## Styling

- **Coloring.** `contours.coloring`: `'fill'` (default: flat bands between levels), `'heatmap'`
  (a smooth heatmap under the lines), `'lines'` (lines colored by level, nothing filled) or
  `'none'` (plain lines in `line.color`).
- **Lines.** `line.color` (default black; ignored for `'lines'`), `line.width` (default 0.5 px,
  2 px for constraints), `line.dash` (`'dot'`, `'dash'`, `'5px,10px,2px'`, …) and
  `line.smoothing`. `contours.showlines: false` hides the lines of filled contours and shaded
  constraints.
- **Labels.** `contours.showlabels`, `contours.labelformat` (d3 format) and `contours.labelfont`
  (defaults to `layout.font`, colored like the lines; with `coloring: 'lines'` each label takes
  its line's color). Labels are also drawn when the lines are hidden.
- **Colorscale.** `colorscale`, `zauto`, `zmin`, `zmax`, `zmid`, `reversescale`, or a shared
  `coloraxis`. As in Plotly, `autocolorscale` is off: the default `holochart` look gives contours
  its sequential neon plasma ramp, and `plotly-classic` Plotly's `RdBu`. See
  [colors and colorscales](/fundamentals/colors-colorscales).
- **Colorbar.** `showscale` and `colorbar`. The colorbar shows blocks with hard edges at the
  levels for `'fill'`, a continuous gradient for `'heatmap'` and `'lines'`, and nothing for
  `'none'` or constraints.
- **Legend.** A colored contour is described by its colorbar and has no legend entry unless
  `showlegend: true`; plain lines (`'none'`) and constraints have one, drawn as their line or
  shading.
- **Order.** Contours draw above heatmaps and below bars and scatter traces in the same subplot;
  `zorder` changes that.

## Interactivity

- **Hover.** Between the first and last grid point, the grid point nearest to the pointer (cells
  split halfway between points) shows its coordinates and value (`x: 4`, `y: 2`, `z: 23`), as in
  Plotly. `xhoverformat`, `yhoverformat` and `zhoverformat` format them, `hovertemplate` can use
  `%{x}`, `%{y}`, `%{z}` and `%{text}`, and `text` / `hovertext` add per-point text (2D like
  `z`). Gaps drawn as holes show an empty `z`, or no label with `hoverongaps: false`. Constraint
  contours color the label with their fill. Scatter points drawn on top win the `closest` hover.
- **Events.** `hover` and `click` points carry `x`, `y`, `z` and `pointNumber`, the
  `[row, column]` of the grid point (the index of the point with column data):

  ```ts
  chart.on('click', (e) => console.log(e.points[0]?.pointNumber, e.points[0]?.z));
  ```

- **Zoom and pan.** Fills, the heatmap and unlabelled lines are in data space: zooming and panning
  only change transforms. Level labels are placed in pixels, so they are re-placed (and the lines
  re-cut under them) after a zoom.
- **Selection.** Box and lasso selection don't select contours.

## Performance notes

- Contouring (marching squares per level, smoothing, the fill regions and the gap mask) runs once
  per data or level change, on the CPU, and scales with the number of grid cells times the number
  of levels: a 500 × 500 grid at 15 levels takes a few tens of milliseconds.
- Filled contours are drawn by the fill primitive, a code chunk loaded the first time a fill is
  shown. All bands of a trace are one draw call, and so are the lines of all levels. Holes for
  gaps are cut on the GPU side of the fill (an intersect fill rule), not by extra passes.
- `'heatmap'` coloring uses the GPU heatmap (one textured quad).
- Labels are text, typeset asynchronously, and re-placed after zooming. On fine grids with many
  levels, leave `showlabels` off or use fewer levels.

## Accessibility notes

- **Screen readers:** the chart is a `<canvas>`; the hidden description (see the
  [accessibility guide](/guides/accessibility)) gives the grid size, the levels (or the
  constraint) and where the highest and lowest values are, and its data table lists the grid
  points.
- **Keyboard:** there is no keyboard navigation yet.
- **Color:** level labels (`showlabels`) carry the values without relying on color. Prefer a
  sequential scale that is monotonic in lightness (the default), and give constraint shadings
  different line dashes as well as colors, as in the constraint example.

## Attribute reference

See the [contour attribute reference](/reference/contour) for every attribute, its type, and its
default. Shared color axes are under [`coloraxis`](/reference/layout#coloraxis) in the layout
reference.

## Related charts

- [2D density contour](/charts/statistical/histogram2d-contour): contours of samples binned on a
  grid, with the same levels, coloring, labels and constraints
- [Heatmap](/charts/scientific/heatmap): the same grid as colored cells, with exact values and
  cell labels
- [Log plots](/charts/scientific/log-plots): contours work on log axes too

<Example id="histogram2dcontour/filled" :height="320" />

## Plotly migration notes

- Attribute names and defaults match Plotly's `contour`: the grid (`z`, `x`, `x0`, `dx`, `y`,
  `y0`, `dy`, `xtype`, `ytype`, `transpose`), `connectgaps`, `hoverongaps`, `autocontour`,
  `ncontours`, `contours.start` / `end` / `size` / `coloring` / `showlines` / `showlabels` /
  `labelfont` / `labelformat` / `type` / `operation` / `value`, `fillcolor`, `line.color` /
  `width` / `dash` / `smoothing`, `texttemplate` / `textfont`, the colorscale attributes and the
  hover formats.
- Not supported yet: `xperiod` / `yperiod` alignment, `xcalendar` / `ycalendar`, and range breaks.
- Differences:
  - A value exactly equal to a level counts as above it (Plotly: below).
  - Smoothing is applied in grid-index space, and on log axes crossings are interpolated in log
    coordinates (Plotly smooths in pixels and interpolates in data units), so smoothed or log-axis
    lines can differ slightly.
  - Label placement follows Plotly's optimizer on polylines; labels can land a few pixels away
    from Plotly's on curvy lines.
  - With `coloring: 'heatmap'` and gaps drawn as holes, the heatmap hides the whole cell around a
    gap rather than the clipped diamond.
  - With trace `opacity` below 1, filled contours show the band overlaps: bands are painted over
    each other, from the lowest level up.
  - For `coloring: 'lines'`, the colorbar is a continuous gradient; Plotly draws the level lines
    in it.
