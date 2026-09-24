---
title: Box plot
description: Summarize distributions by their quartiles, median, whiskers and outliers, and compare them across groups.
status: complete
chart: box
---

# Box plot

## Overview

A box plot summarizes each sample with five numbers: the box spans the first to the third
quartile (the middle half of the values), a line marks the median, whiskers reach the most
extreme samples within 1.5 interquartile ranges (IQR) of the box, and the samples beyond the
whiskers are drawn as outlier points. Boxes sit side by side along a category or numeric axis, so
they compare many distributions at a glance: response times per service, scores per group,
measurements per batch.

Holochart's `box` trace follows Plotly's: you give it the samples and it computes the statistics
(with Plotly's quartile methods, so the numbers match), or you give it precomputed statistics.

Pick a different chart when:

- the shape matters (two peaks, a long tail): a [violin plot](/charts/statistical/violin) shows the
  density, which a box hides;
- there are only a few observations per group: a [strip plot](/charts/statistical/strip) shows
  every one of them;
- you want counts per value range: use a [histogram](/charts/statistical/histogram).

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

const el = document.getElementById('chart')!;
createChart(el, {
  data: [
    { type: 'box', name: 'Control', y: [41, 38, 45, 52, 36, 44, 47, 71, 40, 39] },
    { type: 'box', name: 'Treatment', y: [51, 55, 48, 62, 50, 58, 44, 57, 88, 53] },
  ],
});
```

Each trace with only `y` is one box at its trace name, on a category x axis:

<Example id="box/basic" />

## Data format

**Samples.** A vertical box takes its samples in `y`. With an `x` array of the same length, each
sample's `x` is its position and every distinct position gets its own box (one trace can hold a
box per category or per date). Without `x`, the whole trace is one box at `x0`, else at its trace
name on a category axis (or a numeric or date name on a linear or date axis), else at its index
among the box traces. Give samples in `x` instead for horizontal boxes (`orientation: 'h'` is
inferred); positions then come from `y` and `y0`.

Values that are not numbers (or dates on a date axis) are skipped. Samples may be plain arrays or
typed arrays (`Float64Array`).

**Precomputed statistics.** `q1`, `median` and `q3` (one value per box) switch the trace from
samples to statistics:

| Attribute                   | Meaning                                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| `q1`, `median`, `q3`        | Quartiles and median (required); boxes with `q1 ≤ median ≤ q3` are drawn, others collapse to a line   |
| `lowerfence`, `upperfence`  | Whisker ends. Default: from the samples (if any) like the sample path, else the quartiles             |
| `mean`, `sd`                | Mean and standard deviation. Setting them turns `boxmean` on (`'sd'` with `sd`)                       |
| `notchspan`                 | Half-height of the notch. Setting it turns `notched` on                                               |
| `x` (vertical), `x0` / `dx` | Box positions: an array, or `x0 + i·dx` (default 0 and 1)                                             |
| `y` (vertical)              | Optional sample arrays, one per box (`[[…], […]]`), drawn as points (`boxpoints` defaults to `'all'`) |

### How the statistics are computed

- **Quartiles** use `quartilemethod`. `'linear'` (the default, Plotly's) reads the sorted sample as
  evenly spaced quantiles, `q = p·n − 0.5` (type 5 in most statistics packages). For odd sample
  sizes, `'exclusive'` takes the medians of the lower and upper halves without the median, and
  `'inclusive'` with it. For 1…9: linear gives q1 = 2.75 and q3 = 7.25, exclusive 2.5 and 7.5,
  inclusive 3 and 7. Even sizes use linear in every method.
- **Whiskers** (fences) end at the lowest sample ≥ q1 − 1.5 IQR and the highest ≤ q3 + 1.5 IQR,
  never inside the box. With `boxpoints: false` they reach the minimum and maximum instead, as in
  Plotly.
- **Outliers** are the samples beyond the whiskers. _Suspected_ outliers are those between the
  whiskers and 3 IQR from the quartiles (`4·q1 − 3·q3`, `4·q3 − 3·q1`).
- **Notches** span the median ± 1.57 · IQR / √n, a 95% confidence interval for the median.
- **Mean and sd**: the arithmetic mean and the population standard deviation, times `sdmultiple`.

## Variations

### Grouped boxes

Two traces over the same categories, with `layout.boxmode: 'group'`, sit side by side in each
category. `boxgap` sets the gap between categories and `boxgroupgap` between the boxes of one
category (both 0.3 of the slot). `offsetgroup` puts traces in the same slot; `alignmentgroup`
lets traces on one axis lay out independently.

<Example id="box/grouped" />

### Notches, mean and standard deviation

`notched: true` cuts notches at the median's confidence interval: when the notches of two boxes
don't overlap, their medians differ with roughly 95% confidence. `notchwidth` (0–0.5) is how deep
they cut. `boxmean: true` adds the mean as a dashed line; `boxmean: 'sd'` also draws a dashed
diamond spanning ± `sdmultiple` standard deviations. `sizemode: 'sd'` draws the box itself from
mean − sd to mean + sd, with a line at the mean and no whiskers.

<Example id="box/notched" />

### All points, with jitter

`boxpoints: 'all'` draws every sample. `pointpos` places the points in box half-widths from the
center (−1.8: to the left of the box), and `jitter` spreads them across up to that fraction of the
box width, more where samples are dense. The spread is repeatable: Plotly's seeded generator, so
the same data always gives the same picture. `boxpoints: 'suspectedoutliers'` draws only the
outliers and styles the suspected ones with `marker.outliercolor`,
`marker.line.outliercolor` and `marker.line.outlierwidth`.

<Example id="box/points" />

### Horizontal boxes

Samples in `x` make horizontal boxes, which leave room for long category names.

<Example id="box/horizontal" />

### Precomputed statistics

When only summaries are stored, give `q1`, `median`, `q3` and optionally the fences, mean, sd and
notch spans. The same styling, grouping and hover apply.

<Example id="box/precomputed" />

### Category and date axes

Positions and values can be dates. On the left, samples whose `x` are the first day of each month
make one box per month; box widths follow the spacing of the dates. On the right, horizontal boxes
of date values (ship dates) sit at category positions.

<Example id="box/dates" />

## Styling

- **Box.** `line.color` and `line.width` (default 2 px) style the outline, median and whiskers;
  `fillcolor` defaults to the line color at half opacity. Colors default to the colorway, one per
  trace (or `marker.color` when set).
- **Width.** Without `width`, boxes take 0.7 × 0.7 of their slot (`boxgap`, `boxgroupgap`);
  `width` sets it in axis units (category slots, or milliseconds on date axes).
- **Whiskers.** `whiskerwidth` is the width of the caps as a fraction of the box (0 removes them),
  `showwhiskers: false` hides the whiskers.
- **Points.** `marker.size` (default 6), `symbol`, `color`, `opacity`, `angle` and
  `marker.line.*`; outlier styles as above.
- **Theme.** In the default dark look boxes use the colorway; `layout.template: 'plotly-classic'`
  gives Plotly's look.

## Interactivity

- **Hover on boxes** (`hoveron: 'boxes'`) shows one label per statistic — max, upper fence, q3,
  median, mean, q1, lower fence, min — each at its value, as Plotly does; only the median label
  carries the trace name. In `closest` mode they read `(position, median: 5.5)`; in `x` / `y`
  modes the position goes in the axis label. The whole slot of a position hovers its box.
- **Hover on points** (`hoveron: 'points'`) shows the point's position and value (and `text` /
  `hovertext`); `hovertemplate` applies to points. In `closest` mode a point under the pointer wins
  over the box statistics. The default is `'boxes+points'`.
- **Selection.** Box and lasso selection pick the drawn points; `selected` / `unselected` style
  them. `selectedpoints` holds data indices.
- **Events.** Point hovers and clicks report `pointNumber` (the sample's index); box hovers report
  the samples of the box in `pointNumbers`.

## Performance notes

- All boxes of a trace are one fill and one line batch, and all points one instanced marker set,
  so hundreds of boxes and hundreds of thousands of samples draw in a handful of draw calls.
- Statistics are computed in calc, in typed arrays, once per data change; zoom and pan only move
  the camera. Calc sorts the samples of each box (n log n).
- `boxpoints: 'all'` with very large samples draws every point: prefer `'outliers'` (the default)
  or a [violin](/charts/statistical/violin) beyond a few thousand samples per box.

## Accessibility notes

- **Screen readers:** each box trace is described with its box count, sample count and the range
  of its medians, and a hidden table lists every box's position, count, min, quartiles, median, max
  and mean. See the [accessibility guide](/guides/accessibility).
- **Keyboard:** there is no keyboard navigation between boxes yet.
- **Color:** boxes are identified by position and trace name; with grouped boxes keep the legend
  visible, and prefer distinct fills and outlines over hue alone.

## Attribute reference

See the [box attribute reference](/reference/box), and the [layout reference](/reference/layout)
for `boxmode`, `boxgap` and `boxgroupgap`.

## Related charts

- [Violin](/charts/statistical/violin): the full density shape, optionally with a box inside
- [Strip](/charts/statistical/strip): every observation as a jittered point
- [Histogram](/charts/statistical/histogram): counts per bin of one distribution

## Plotly migration notes

- Box figures from plotly.js and plotly.py carry over: sample and precomputed input, every
  statistic, `quartilemethod`, `boxmean`, `notched`, `boxpoints`, jitter (same generator, same
  spread), `boxmode` grouping and multi-label hover behave as in Plotly.
- Not supported yet: `xperiod` / `yperiod` alignment, `xcalendar` / `ycalendar`,
  `x`/`yhoverformat`, `selected.marker.size`, `hovertemplate` on the statistic labels (Plotly
  ignores it there too).
- Differences:
  - The median line is not nudged 1 px inside the box when it equals a quartile.
  - A trace without positions is typed from its name like in Plotly, but Holochart stores the
    position as a one-element `x` in `fullData` (so the axis types and lists it).
  - Unlike Plotly, the value-axis autorange also covers mean ± sd in `sizemode: 'sd'`.
