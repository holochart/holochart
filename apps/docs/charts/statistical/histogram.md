---
title: Histogram
description: Bin one variable's samples into bars that count them (or sum, average, min or max another value) to show its distribution.
status: complete
chart: histogram
---

# Histogram

## Overview

A histogram takes raw samples, splits their range into bins, and draws one bar per bin whose
length is the number of samples in it. It shows the shape of a distribution: where the values
cluster, how spread out they are, whether there are several peaks, and how long the tails are.
You pass the samples, not the counts: Holochart does the binning, with the same rules as Plotly,
so a Plotly figure bins the same way.

A histogram is a bar-like trace: it groups, stacks and overlays with `bar` traces, and styles,
labels and error bars work as for [bars](/charts/basic/bar). Histograms can also be normalized
(percent, probability, density) or cumulative, and aggregate a second value per bin instead of
counting (`histfunc`).

Pick a different chart when:

- you already have one value per category or period (the counts are computed): use a
  [bar chart](/charts/basic/bar);
- you want the joint distribution of two variables: use a
  [2D histogram](/charts/statistical/histogram2d) or a
  [2D density contour](/charts/statistical/histogram2d-contour);
- you have a few dozen samples and each one matters: use a [scatter](/charts/basic/scatter)
  (a strip of points) rather than bins that hide them.

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

const chart = createChart(document.getElementById('chart')!, {
  data: [{ type: 'histogram', x: [3.1, 4.7, 4.2, 5.8, 4.9, 6.3, 5.1, 4.4, 5.5, 7.2] }],
});
```

Without bin settings, the bin size is a round number (1, 2 or 5 × 10ⁿ) picked from the spread
and the number of samples, and the bars touch (`bargap` defaults to 0 for histograms). The live
example bins 800 response times into 5 ms bins; hover a bar to see its bin range and count:

<Example id="histogram/basic" />

## Data format

- `x`: the samples, binned along x into vertical bars. Give `y` instead for horizontal bars:
  with only `y`, `orientation` is inferred as `'h'`.
- Samples can be numbers, dates (date strings, or ms on a date axis) or
  categories, following the axis type (see [data formats](/fundamentals/data-formats)). On a
  category axis, each category is a bin by default.
- `histfunc`: with both `x` and `y`, the bars can aggregate the other coordinate (`y` for
  vertical histograms) over each bin: `'count'` (default, ignores it), `'sum'`, `'avg'`,
  `'min'` or `'max'`. Only the first `min(x.length, y.length)` samples are used, and a sample
  whose aggregated value is not a number (`null`, `NaN`, a non-numeric string) adds nothing to
  its bin. Empty bins of `avg`, `min` and `max` have no value.
- A sample outside the bins (below `xbins.start`, past the last bin, or with a missing
  position) is ignored.
- `text` and `customdata` are per bar (per bin), as for bars.

```ts
import { createChart } from '@mk7s/holochart';

// Total order value (y) per 2-hour bin of order time (x).
const hour = [8.2, 9.5, 10.1, 11.7, 12.3, 12.9, 13.4, 15.8, 18.2, 19.1];
const value = [24, 31, 18, 42, 55, 38, 27, 33, 61, 47];

createChart(document.getElementById('chart')!, {
  data: [{ type: 'histogram', x: hour, y: value, histfunc: 'sum', xbins: { size: 2 } }],
});
```

### Bins

Automatic bins follow Plotly's rule:

- **Numbers.** The size is the next round step (1, 2 or 5 × 10ⁿ) at or above `2σ / n^0.4` (σ
  the standard deviation, n the sample count), but not below the smallest gap between distinct
  values, rounded down. Bins start on a multiple of the size, moved off the data: all-integer
  data is shifted by 0.5 so that no integer sits on a bin edge (bins of 5 start at -0.5, so 0–4
  fall in the first bin).
- **Dates.** Sizes go from milliseconds up to days, then to calendar months and years (`'M1'`,
  `'M3'`, `'M12'`, …). Month bins are shifted so that whole dates sit well inside a bin.
- **Categories.** One bin per category.
- Empty bins at both ends are dropped (as in Plotly), so autorange doesn't include them.

To control the bins:

- `nbinsx` (or `nbinsy` for horizontal histograms): the maximum number of bins. The size is
  still rounded to a nice step, so you may get fewer bins than asked. Ignored when `xbins.size`
  is set.
- `xbins` (or `ybins`) `{ start, end, size }`: explicit bins; any part you leave out stays
  automatic. On a date axis, `start` and `end` are dates (or ms) and `size` is in milliseconds,
  or `'M<n>'` for calendar months (`'M1'` monthly, `'M3'` quarterly, `'M12'` yearly). On a
  category axis, `start` and `end` are category indices (`-0.5` is the start of the first
  category) and `size` is a whole number of categories per bin.
- `autobinx` / `autobiny` are obsolete: every bin setting is automatic unless set. `true`
  ignores `xbins`.
- `bingroup`: histograms with the same `bingroup` share their bins, also across subplots (on
  axes of the same type), so their bars line up. Under `layout.barmode` `'stack'` or `'group'`
  (the default), the histograms of one subplot and orientation always share bins. Under
  `'overlay'`, each histogram bins on its own unless they share a `bingroup`.

### Normalization

`histnorm` scales the bar values:

| `histnorm`              | Bar value                       | Sums to                |
| ----------------------- | ------------------------------- | ---------------------- |
| `''` (default)          | the count (or `histfunc` value) |                        |
| `'percent'`             | share of the total × 100        | heights sum to 100     |
| `'probability'`         | share of the total              | heights sum to 1       |
| `'density'`             | value per unit of bin width     | areas sum to the total |
| `'probability density'` | share per unit of bin width     | areas sum to 1         |

The density norms divide by the bin width in calc units: per unit on numeric axes, per
millisecond on date axes, per category on category axes. Density matters when bins have
different widths (month bins) or when you compare histograms with different bin sizes.

`cumulative: { enabled: true }` makes each bar the running sum of the bins before it:

- `direction`: `'increasing'` (default, sums from the left) or `'decreasing'` (sums from the
  right, "at least this much").
- `currentbin`: whether a bar counts its own bin: `'include'` (default), `'exclude'`, or
  `'half'` (half of it, which removes the half-bin bias of the other two).
- With a density norm, a cumulative histogram behaves like the norm without density: it rises
  to the total (`'density'`) or to 1 (`'probability density'`).

## Variations

### Probability density

`histnorm: 'probability density'` makes the bar areas sum to 1, so the histogram can sit on the
same axes as a density curve, here the normal distribution the samples came from. `nbinsx: 40`
asks for at most 40 bins.

<Example id="histogram/normalized" />

### Cumulative distribution

`cumulative.enabled` with `histnorm: 'percent'` gives an empirical CDF that rises to 100 %. The
second trace accumulates `'decreasing'` (sessions at least this long), and both count half of
the current bin (`currentbin: 'half'`). Explicit `xbins` give one-minute bins.

<Example id="histogram/cumulative" />

### Overlaid distributions

`barmode: 'overlay'` draws histograms over each other; a trace `opacity` keeps both readable.
Overlaid histograms bin independently, so the two traces share a `bingroup` to get the same bins
and bars that line up.

<Example id="histogram/overlay" />

### Stacked with bars

Histograms and bars share one stack group per subplot, as in Plotly. Two histograms bin raw
order times into hourly bins, and a `bar` trace of pre-counted phone orders at the same hours
stacks on top of them. Under `barmode: 'stack'` the two histograms share their bins.

<Example id="histogram/stacked-bars" />

### Dates by month

On a date axis, `xbins.size: 'M1'` bins by calendar month (`'M3'` by quarter, `'M12'` by year),
so every bin is one month even though months differ in length. All bars take the width of the
narrowest bin (February), as in Plotly.

<Example id="histogram/date-months" />

### Horizontal

With only `y`, the orientation is `'h'` and the bars grow to the right. `ybins.size: 5` sets
5-year bins; their start stays automatic, so integer ages get bins from 19.5, 24.5, … and hover
reads `20 - 24`, `25 - 29`.

<Example id="histogram/horizontal" />

### Sum and average per bin

With both `x` and `y`, `histfunc` aggregates `y` over each `x` bin: the top panel sums revenue
per hour, the bottom one averages the basket, labelled with `texttemplate` (`%{y}` is the bar
value).

<Example id="histogram/histfunc" />

## Styling

Histograms reuse the bar styling:

- `marker.color`: one color, one per bar (bin), or numbers mapped through `marker.colorscale`;
  `marker.line.color` / `marker.line.width` for outlines, `marker.opacity`, and
  `marker.cornerradius` (or `layout.barcornerradius`).
- `text`, `texttemplate`, `textposition`, `textfont`, `insidetextfont`, `outsidetextfont`,
  `textangle`, `insidetextanchor` and `constraintext` for bar labels. In `texttemplate`, `%{x}`
  and `%{y}` are the bin center and the bar value (for vertical histograms).
- `error_x` / `error_y` for error bars, with the same options as bars.
- `offsetgroup` and `alignmentgroup` to control grouping, as for bars.
- `selected.marker` / `unselected.marker` for the look of selected and faded bars.

The layout options that combine bar-like traces apply to histograms too:

- `layout.barmode`: `'group'` (default, side by side), `'stack'`, `'overlay'` or `'relative'`
  (positive and negative values stacked separately). Histograms and bars stack and group
  together.
- `layout.bargap`: defaults to 0 when a histogram is on a non-category position axis, so bins
  touch, unless `barmode: 'group'` puts two bar-like traces on one subplot (then it stays 0.2).
  Set it explicitly for a gap.
- `layout.bargroupgap` (gap between the bars of a group) and `layout.barnorm` (`'fraction'` or
  `'percent'` stacks).

The default dark `holochart` template ([themes and templates](/customization/themes-templates))
colors histograms from its colorway like any trace. It has no `histogram` entry yet, so error
bars on histograms keep Plotly's `#444` default, which barely shows on the dark background: set
`error_y.color` (or `error_x.color`) yourself.

## Interactivity

- **Hover.** The label shows the bin range and the value, formatted like Plotly: `0 - 4` for
  integer data in bins of 5, `45 - 49.99` for data with two decimals, a date range for date bins
  (month ranges for month bins). When every sample in a bin has the same value, the label shows
  that value; cumulative histograms show the bin center. `hovermode: 'x'` shows every trace at
  that position, which suits stacked and grouped histograms. `hovertemplate` takes `%{x}`,
  `%{y}`, `%{text}` and `%{customdata}`, as for bars.
- **Events.** `hover` and `click` points carry `binNumber` (the index of the bar) and the
  indices of the samples in the bin as `pointNumbers` (and `pointIndices`), for drill-down.
  Cumulative histograms don't list samples.

  ```ts
  chart.on('click', (e) => {
    const samples = e.points[0]?.pointNumbers ?? [];
    console.log(`bin ${String(e.points[0]?.['binNumber'])}: ${samples.length} samples`);
  });
  ```

- **Selection.** Box and lasso selection select the underlying samples: a bar whose center is
  inside the selection selects every sample in its bin. `selectedpoints` holds sample indices
  (Plotly semantics), and a bar is drawn selected when any of its samples is, so setting
  `selectedpoints` to samples picked elsewhere (on a scatter of the same data) highlights their
  bins. The `selected` event lists one point per selected sample.
- **Zoom and pan.** Drag to zoom, double-click to reset. Bins stay fixed while zooming.
- **Legend.** Click an entry to hide a trace; the remaining stacks and groups re-flow.

## 3D-native options

Histogram bars can't be extruded yet: bar extrusion (`depth`, `bevel`, `material`) is a planned
Holochart extension (M6) that histograms will share with bars.

## Performance notes

- Binning runs on the CPU in the calc step and is O(n) in the samples: each sample's bin is
  found by arithmetic for numeric bins and by a binary search over the edges for month bins.
  Automatic sizing also scans the distinct values for the smallest gap, an O(n log n) sort; set
  `xbins.size` to skip it for very large data.
- Typed arrays (`Float64Array`, …) are accepted for `x` and `y`.
- The bars are one instanced rectangle set on the GPU, like bars, so the draw cost depends on the
  number of bins, not samples. Zoom and pan don't re-bin.
- Changing samples or bin settings re-runs the calc of the histogram; changing a color or opacity
  only restyles.
- Rebinning on zoom (`xbins.adaptive`) is not implemented yet. See the
  [performance guide](/guides/performance) for large data in general.

## Accessibility notes

- **Screen readers:** the chart is a `<canvas>`; the hidden description (see the
  [accessibility guide](/guides/accessibility)) says how many samples were binned into how many
  bins, the range the bins cover, and the largest bin with its value and range. Its data table
  lists each bin's range and value (the first 100 rows).
- **Keyboard:** there is no keyboard navigation between bars yet.
- **Color:** a histogram reads by bar length, not color. When overlaying distributions, pick
  colors that differ in lightness and keep `opacity` around 0.6 so both stay visible where they
  overlap; for more than two distributions, small multiples (one subplot each, with a shared
  `bingroup`) read better than a crowded overlay. Axis titles that name the unit and what is
  counted ("Requests", "Probability density") matter more here than on most charts.

## Attribute reference

See the [histogram attribute reference](/reference/histogram) for every attribute, its type, and
its default. The options shared with bars, such as [`barmode`](/reference/layout#barmode) and
[`bargap`](/reference/layout#bargap), are in the layout reference.

## Related charts

- [Bar](/charts/basic/bar): values you have already counted or aggregated, one per category
- [2D histogram](/charts/statistical/histogram2d): the joint distribution of two variables, as
  a grid of colored cells
- [2D density contour](/charts/statistical/histogram2d-contour): the same 2D binning drawn as
  contour levels

## Plotly migration notes

- Attribute names and defaults match Plotly's `histogram`: `x` / `y`, `orientation`,
  `histfunc`, `histnorm`, `cumulative`, `nbinsx` / `nbinsy`, `xbins` / `ybins`, `autobinx` /
  `autobiny`, `bingroup`, and the bar styling attributes. Automatic bins, bin groups, hover
  labels and `selectedpoints` follow Plotly's rules, so Plotly figures carry over.
- Selection events list one point per selected sample; Plotly lists one point per bin, with the
  samples in `pointNumbers`.
- Restyling one member of a `bingroup` re-bins only that trace until the next full
  recalculation, because the runtime recalculates traces individually. Plotly re-bins the whole
  group.
- On a log position axis, histograms are binned linearly in data units (as in Plotly), but the
  bar widths are laid out in log space.
- With `textposition` `'auto'` or `'inside'`, a label on an empty bin between non-empty ones may
  still be shown outside the bar.
- Not supported yet: `xbins.adaptive` / `ybins.adaptive` (rebinning on zoom), `xcalendar` /
  `ycalendar` (non-Gregorian calendars), `xhoverformat` / `yhoverformat`, and `marker.pattern`.
