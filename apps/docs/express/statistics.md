---
title: Statistical charts
description: Histograms, box, violin and strip plots, ECDFs, densities, marginal plots, scatter matrices and distplot with Express.
status: complete
---

# Statistical charts

Express builds px's statistical charts from a table: distributions per group, empirical CDFs,
2D densities, marginal distributions alongside a plot, and plotly.py's `create_distplot`.

## Histograms

`histogram` draws one `histogram` trace per group, sharing bins (`bingroup`) and stacked by
default (`barmode: 'relative'`). With only `x`, bars count rows; with both `x` and `y`, `y` is
summed per x bin (`histfunc: 'sum'`), as in px.

| Option       | px           | What it does                                                              |
| ------------ | ------------ | ------------------------------------------------------------------------- |
| `histfunc`   | `histfunc`   | `'count'`, `'sum'`, `'avg'`, `'min'`, `'max'` of `y` per bin              |
| `histnorm`   | `histnorm`   | `'percent'`, `'probability'`, `'density'`, `'probability density'`        |
| `barnorm`    | `barnorm`    | `'fraction'` or `'percent'` of each bin's total                           |
| `barmode`    | `barmode`    | `'relative'` (default), `'group'`, `'overlay'`, `'stack'`                 |
| `nbins`      | `nbins`      | Most bins (`nbinsx`, or `nbinsy` horizontal)                              |
| `cumulative` | `cumulative` | Cumulative counts                                                         |
| `marginal`   | `marginal`   | A [marginal](#marginals) of the same values above (right when horizontal) |

The aggregate axis is titled as px titles it: `count`, `sum of tip`, `percent`,
`fraction of sum of tip`, `count (normalized as percent)`.

## Box, violin, strip

`box`, `violin` and `strip` draw one trace per group at each category, side by side
(`boxmode` / `violinmode` / `stripmode: 'group'`), or overlaid when `color` is the category column.
A chart without a category column puts its single box at the category `' '` (px's `x0: ' '`), so
groups line up.

- `box`: `points` (`'outliers'`, `'suspectedoutliers'`, `'all'`, `false`), `notched`.
- `violin`: `points`, `box` (a box inside each violin); violins of a chart share one scale
  (`scalegroup`).
- `strip`: every row as a jittered point (a `box` with `boxpoints: 'all'` and an invisible box),
  `jitter` 0–1. The same figure as the [`strip()` helper](/charts/statistical/strip), with Express's
  data input, facets and animation.

## ECDF

`ecdf` plots the empirical cumulative distribution of `x` per group, as `px.ecdf`: the values
sorted, and a step line (`line.shape: 'hv'`) up through the share of rows at or below each value.
It compares distributions without choosing bins.

<Example id="express/ecdf" :height="440" />

```ts
import hx from '@mk7s/holochart-express';

declare const tips: object[];
hx.ecdf(tips, { x: 'total_bill', color: 'time', marginal: 'rug' });
```

| Option     | px         | What it does                                                                            |
| ---------- | ---------- | --------------------------------------------------------------------------------------- |
| `ecdfnorm` | `ecdfnorm` | `'probability'` (default, 0–1), `'percent'` (0–100), or `null` (counts)                 |
| `ecdfmode` | `ecdfmode` | `'standard'` (at or below x), `'reversed'` (at or above x), `'complementary'` (above x) |
| `markers`  | `markers`  | Markers at the steps (default `false`)                                                  |
| `lines`    | `lines`    | The step line (default `true`)                                                          |
| `y`        | `y`        | Weights: each row counts its `y` instead of 1                                           |
| `marginal` | `marginal` | A [marginal](#marginals) of the values above the plot                                   |

Given only `y`, the ECDF is horizontal. The cumulative axis starts at zero and is titled
`probability`, `percent` or `count`. `ecdfValues(values, weights?, norm?, mode?)` computes one
ECDF on its own.

## Densities

`densityHeatmap` is `px.density_heatmap`: a `histogram2d` counting rows per x-y bin (or
aggregating `z` with `histfunc`, default `'sum'`), colored on `layout.coloraxis` with a colorbar
titled `count` / `sum of z`. `densityContour` is `px.density_contour`: `histogram2dcontour` lines
(`contours.coloring: 'none'`), one per `color` group in its color. Both take `nbinsx`, `nbinsy`,
`histnorm`, and marginals.

<Example id="express/density-heatmap" :height="480" />

```ts
import hx from '@mk7s/holochart-express';

declare const tips: object[];
hx.densityHeatmap(tips, {
  x: 'total_bill',
  y: 'tip',
  nbinsx: 20,
  nbinsy: 16,
  marginalX: 'histogram',
  marginalY: 'histogram',
});
```

## Marginals

`marginalX` draws the distribution of `x` in a strip above the plot, and `marginalY` that of `y`
at its right, on `scatter`, `densityHeatmap` and `densityContour` (`histogram` and `ecdf` take
`marginal`, for their own values). Each is one of:

| Kind          | Draws                                                                      |
| ------------- | -------------------------------------------------------------------------- |
| `'histogram'` | a histogram per group (`opacity: 0.5`, shared bins), counts on a bare axis |
| `'box'`       | a notched box per group                                                    |
| `'violin'`    | a violin per group                                                         |
| `'rug'`       | a tick (`line-ns-open` / `line-ew-open` marker) per value, per group       |

<Example id="express/marginals" :height="500" />

```ts
import hx from '@mk7s/holochart-express';

declare const tips: object[];
hx.scatter(tips, {
  x: 'total_bill',
  y: 'tip',
  color: 'smoker',
  marginalX: 'box',
  marginalY: 'violin',
});
```

The layout is px's: the marginal takes 26% of the plot's height (width) with a histogram or a
`color`, else 16%, 1% (0.5%) apart. Its data axis `matches` the main plot's, so zooming the plot
zooms the marginal, and its other axis is bare (no tick labels, line or ticks; grid lines only
behind histograms). Marginal traces take their group's color and share its legend entry. With both
marginals the top-right corner stays empty. Marginals combine with facets along the other
direction (`marginalX` with `facetCol`).

## Many dimensions

`scatterMatrix` (`px.scatter_matrix`) draws one `splom` trace per `color` / `symbol` group over
`dimensions` — by default every numeric column not used by another option — with the diagonal
hidden and box / lasso selection (`dragmode: 'select'`) linked across cells.

<Example id="express/scatter-matrix" :height="620" />

`parallelCoordinates` (`px.parallel_coordinates`) draws one `parcoords` trace over the numeric
columns, and `parallelCategories` (`px.parallel_categories`) one `parcats` trace over the columns
with at most `dimensionsMaxCardinality` (50) distinct values. A numeric `color` colors their
lines through a colorscale with a colorbar; these two put it on the trace (`line.colorscale`)
rather than `layout.coloraxis`, which Holochart's parcoords and parcats don't read yet.

## Distplot

`ff.distplot` is plotly.py's `figure_factory.create_distplot`: for each sample set, a histogram
normalized to a probability density, a curve on the same axes, and a rug of the samples in a strip
below, sharing the x axis.

<Example id="express/distplot" :height="460" />

```ts
import { ff } from '@mk7s/holochart-express';

const a = [1.2, 0.3, -0.8, 0.9, 1.7, -0.2, 0.4];
const b = [2.1, 2.9, 1.8, 2.4, 3.3, 2.6, 2.2];
const figure = ff.distplot([a, b], ['Group A', 'Group B'], { binSize: 0.25 });
```

| Option                             | `create_distplot` | What it does                                                                     |
| ---------------------------------- | ----------------- | -------------------------------------------------------------------------------- |
| `binSize`                          | `bin_size`        | Bin width, one for all sets or one per set (default 1)                           |
| `curveType`                        | `curve_type`      | `'kde'` (default) or `'normal'`                                                  |
| `histnorm`                         | `histnorm`        | `'probability density'` (default) or `'probability'` (the curve scales to match) |
| `showHist`, `showCurve`, `showRug` | `show_hist`, …    | Draw each part (default all)                                                     |
| `colors`                           | `colors`          | Colors per set. Default: the template's colorway (plotly.py: category10)         |
| `rugText`                          | `rug_text`        | Hover text per sample of the rug                                                 |

The KDE is scipy's `gaussian_kde` with Scott's rule, as plotly.py uses it: a Gaussian kernel with
the samples' standard deviation (n − 1) times `n^(−1/5)` as bandwidth, evaluated at 500 points
from the smallest to the largest sample. `'normal'` fits a normal by maximum likelihood (mean and
standard deviation with n, `scipy.stats.norm.fit`). The layout is `create_distplot`'s: the
histograms and curves on `yaxis` (35–100% of the height), the rug on `yaxis2` (0–25%, one row per
set), `barmode: 'overlay'` and the legend in reverse order. `gaussianKde` and `fitNormal` are
exported for your own curves.
