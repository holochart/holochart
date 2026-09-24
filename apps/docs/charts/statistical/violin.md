---
title: Violin plot
description: Show the shape of distributions as mirrored kernel density estimates, optionally split or with a box inside.
status: complete
chart: violin
---

# Violin plot

## Overview

A violin plot draws each sample's distribution as a smooth density curve — a kernel density
estimate (KDE) — mirrored around its position, so wide parts are where values are common. Unlike a
[box plot](/charts/statistical/box), it shows the shape: two peaks, skew, a long tail. A box plot
can be drawn inside, and two traces can share a position as the two halves of a split violin.

Holochart's `violin` trace follows Plotly's: the same Gaussian KDE with Silverman's-rule bandwidth,
the same span, scaling and grouping rules, and the same statistics as box plots.

Pick a different chart when:

- samples are small (a few dozen or fewer): the density is mostly the kernel's shape; a
  [strip plot](/charts/statistical/strip) or a [box plot](/charts/statistical/box) is more honest;
- readers need exact quartiles: a box plot shows them directly;
- you compare one distribution against a reference in detail: a
  [histogram](/charts/statistical/histogram) with explicit bins may read better.

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

const el = document.getElementById('chart')!;
createChart(el, {
  data: [
    { type: 'violin', name: 'A', y: [4.1, 5.2, 5.8, 6.0, 6.3, 6.9, 7.4, 8.8] },
    { type: 'violin', name: 'B', y: [2.2, 2.9, 3.1, 7.8, 8.2, 8.5, 9.1, 9.6] },
  ],
});
```

Each trace with only `y` is one violin at its trace name. The middle one below is bimodal, which a
box plot would hide:

<Example id="violin/basic" />

## Data format

Samples work exactly like [box plot samples](/charts/statistical/box#data-format): `y` for vertical
violins (with an optional `x` per sample: one violin per distinct position), `x` for horizontal
ones, `x0` / `y0` or the trace name for a single violin. Violins have no precomputed-statistics
input.

The density:

- **Kernel and bandwidth.** A Gaussian KDE. `bandwidth` sets the kernel width in value-axis units;
  the default is Silverman's rule as Plotly writes it, `1.059 · min(sd, IQR / 1.349) · n^(−1/5)`
  with the sample standard deviation, and at least 1% of the sample range. When all samples are
  equal the violin is a flat line.
- **Span.** `spanmode: 'soft'` (the default) draws the density two bandwidths past the extreme
  samples, `'hard'` stops at them, and `'manual'` uses `span: [start, end]` (setting `span` makes
  it the default; an end that is not a value on the axis, such as `'auto'`, falls back to the soft
  end).
- **Grid.** The density is evaluated in calc on an even grid with steps of at most a third of the
  bandwidth, in typed arrays, so zooming never recomputes it.

## Variations

### Split violins

Two traces at the same positions, one with `side: 'negative'` and one with `side: 'positive'`,
compare two distributions back to back. A shared `scalegroup` puts both halves on one scale so
their widths compare; `violingap: 0` widens the violins.

<Example id="violin/split" />

### Inner box, mean line and points

`box.visible` draws a narrow box plot inside the violin (`box.width` is its width as a fraction of
the violin's; `box.fillcolor` and `box.line` style it). `meanline.visible` draws a dashed line at
the mean: across the inner box when it is shown, else across the violin. `points: 'all'`,
`pointpos` and `jitter` place every sample beside it, like box points.

<Example id="violin/box-meanline" />

### Grouped violins

`layout.violinmode: 'group'` sets the violins of several traces side by side in each category;
`violingap` and `violingroupgap` set the gaps (default 0.3 each).

<Example id="violin/grouped" />

### Horizontal violins, hard span

Samples in `x` give horizontal violins. `spanmode: 'hard'` cuts each density at its extreme
samples — right for bounded values like ages or percentages — and a fixed `bandwidth` smooths all
traces alike.

<Example id="violin/horizontal" />

### Scale groups and count scaling

By default each trace is its own scale group (`scalegroup` defaults to the trace name), so its
widest violin fills the slot. Traces with the same `scalegroup` share a scale:
`scalemode: 'width'` compares densities, `'count'` also makes widths proportional to the number of
samples. On the right, the 30-sample violin is much thinner than the 300-sample one.

<Example id="violin/scalegroup" />

## Styling

- **Violin.** `line.color` and `line.width` (2 px) outline it; `fillcolor` defaults to the line
  color at half opacity. Colors default to the colorway, one per trace.
- **Width.** Without `width`, violins take 0.7 × 0.7 of their slot (`violingap`,
  `violingroupgap`); `width` sets the full width in axis units.
- **Inner box and mean line.** `box.{visible, width, fillcolor, line.color, line.width}` and
  `meanline.{visible, color, width}`; setting any `box` or `meanline` style turns it on.
- **Points.** `points` (`'outliers'` by default, `'all'`, `'suspectedoutliers'` or `false`) and
  the box plot's `marker.*` styles.

## Interactivity

- **Hover on violins** (`hoveron: 'violins'`) shows the violin's statistics like a box plot: max,
  q3, median, q1 and min (plus the fences with points, and the mean with a mean line), each at its
  value, within the density's span and on its drawn side.
- **Hover on the density** (`'kde'`) adds a label at the violin's edge at the pointer's value,
  `(A, y: 5, kde: 0.84)` in `closest` mode: the density relative to the scale group's peak, as
  Plotly reports it.
- **Hover on points** (`'points'`) shows the sample; `hovertemplate` applies. The default is
  `'violins+points+kde'`; in `closest` mode a point under the pointer wins.
- **Selection** picks the drawn points, as for box plots.

## Performance notes

- Each violin is a polyline of a few dozen to a few hundred grid points; all violins of a trace
  are one fill and one line batch, and all points one marker set.
- The KDE costs O(n · grid) per violin, once per data change (calc is pure and worker-friendly):
  about 3 · span / bandwidth grid points. For very large samples, set a larger `bandwidth` (fewer
  grid points) or `spanmode: 'hard'`.

## Accessibility notes

- **Screen readers:** each violin trace is described like a box trace — violin count, sample
  count, the range of the medians — with a hidden table of every violin's statistics. The density
  itself is not described. See the [accessibility guide](/guides/accessibility).
- **Keyboard:** there is no keyboard navigation between violins yet.
- **Color:** split violins differ by side as well as color; keep the legend to name the halves.

## Attribute reference

See the [violin attribute reference](/reference/violin), and the
[layout reference](/reference/layout) for `violinmode`, `violingap` and `violingroupgap`.

## Related charts

- [Box plot](/charts/statistical/box): the statistics without the shape
- [Strip plot](/charts/statistical/strip): every observation
- [Histogram](/charts/statistical/histogram): binned counts instead of a smooth density

## Plotly migration notes

- Violin figures carry over: `bandwidth`, `spanmode` / `span`, `side`, `scalegroup` /
  `scalemode`, `box`, `meanline`, `points`, `violinmode` and hover (including the `kde` label)
  behave as in Plotly.
- Differences:
  - Scale groups are shared within a subplot; Plotly shares them across the whole figure.
  - The outline is drawn through the density grid points; Plotly smooths it with a spline (the
    grid is fine enough that the two look alike).
  - Hover on `kde` shows the label but not Plotly's line across the violin.
  - One-sided violins don't shift their inner box by the box line width.
  - `span` does not accept `null` for an end; to keep one end soft, give a value that isn't one
    on the axis, such as `'auto'`.
- Not supported yet: `xperiod` / `yperiod`, calendars, `x`/`yhoverformat`.
