---
title: Statistical charts
description: Trendlines, histograms, box, violin and strip plots, ECDFs, densities, marginal plots, scatter matrices and distplot with Express.
status: complete
---

# Statistical charts

Express builds px's statistical charts from a table: trendlines through scatter plots,
distributions per group, empirical CDFs, 2D densities, marginal distributions alongside a plot,
and plotly.py's `create_distplot`.

## Trendlines

`trendline` on `scatter` (and `densityContour`) fits a line through each group's points, as
`px.scatter(trendline=…)` does: per group, the rows are sorted by x and a `scatter` line
(`mode: 'lines'`) is drawn through the fitted values, in the group's color, in the group's legend
entry (the line itself is hidden from the legend). Hovering the line shows the fit.

<Example id="express/trendline-ols" :height="440" />

```ts
import hx from '@mk7s/holochart-express';

declare const tips: object[];
const figure = hx.scatter(tips, {
  x: 'total_bill',
  y: 'tip',
  color: 'smoker',
  facetCol: 'time',
  trendline: 'ols',
});
```

| `trendline`   | Fit                                 | `trendlineOptions`                                                                        |
| ------------- | ----------------------------------- | ----------------------------------------------------------------------------------------- |
| `'ols'`       | Ordinary least squares line         | `addConstant` (default `true`; `false` fits through the origin), `logX`, `logY`           |
| `'lowess'`    | Locally weighted regression curve   | `frac`: share of the points in each local fit (default 0.6666666)                         |
| `'rolling'`   | A statistic of a moving window      | `window` (required), `minPeriods`, `center`, `winType`, `function`, `functionArgs`        |
| `'expanding'` | A statistic of every point so far   | `minPeriods` (default 1), `function`, `functionArgs`                                      |
| `'ewm'`       | An exponentially weighted statistic | one of `com`, `span`, `halflife`, `alpha`; `minPeriods`, `adjust`, `ignoreNa`, `function` |

Options follow plotly.py's `trendline_options` in camelCase; keys that don't apply to the kind are
rejected, as in px.

- **OLS** is statsmodels' `OLS(y, x)` with `add_constant`: the hover header reads
  `<b>OLS trendline</b>`, then `tip = 0.105025 * total_bill + 0.92027` and `R²=0.456617`, with
  plotly.py's number formats (six significant digits for the coefficients). R² is centered with an
  intercept and uncentered without, as in statsmodels. `logX` / `logY` fit against log10 of the
  values (they must be positive) and draw `10^fit` for `logY`, labelled `log10(tip) = …`.
- **LOWESS** is statsmodels' `lowess` (Cleveland's algorithm): at each point, a weighted line
  through the `⌊frac · n⌋` nearest points with tricube weights, then three robustifying passes
  that downweight points by the bisquare of their residuals. It matches R's `lowess` to 10⁻⁷ on
  statsmodels' reference data.
- **rolling**, **expanding** and **ewm** follow pandas (`series.rolling(**options).mean()`):
  `function` is `'mean'` (default), `'sum'`, `'median'`, `'min'`, `'max'`, `'std'`, `'var'` or
  `'count'` (`ewm`: `'mean'`, `'sum'`, `'std'`, `'var'`), or for `rolling` / `expanding` a function
  of each window's values. A rolling `window` is a number of points (`minPeriods` defaults to it,
  so the line starts at the window's end) or, over dates, a time span such as `'7D'`, `'12h'` or
  `'30min'`. `winType: 'triang' | 'gaussian'` weights the window (`functionArgs: { std: 2 }` for a
  gaussian). `ewm` uses pandas' `adjust=True` weights by default: the mean at t is
  Σ(1 − α)ⁱ·yₜ₋ᵢ / Σ(1 − α)ⁱ. Missing y values keep their place in the window, as in pandas.

<Example id="express/trendline-rolling" :height="440" />

```ts
import hx from '@mk7s/holochart-express';

declare const prices: object[]; // [{ date: '2025-01-02', ticker: 'ALPHA', close: 98.2 }, …]
hx.scatter(prices, {
  x: 'date',
  y: 'close',
  color: 'ticker',
  trendline: 'rolling',
  trendlineOptions: { window: 20 },
});
hx.scatter(prices, { x: 'date', y: 'close', trendline: 'ewm', trendlineOptions: { halflife: 5 } });
```

Dates on x are fit as Unix seconds (an OLS slope is per second, as in px) and drawn at the dates.
Rows missing x or y are left out of the line; a group with fewer than two complete rows gets an
empty trendline trace.

### One trendline for all rows

`trendlineScope: 'overall'` fits one line through every row instead of one per group, and draws it
in every subplot as `Overall Trendline` with a single legend entry, in the next color of the
sequence. `trendlineColorOverride` gives every trendline one color.

<Example id="express/trendline-lowess" :height="440" />

```ts
import hx from '@mk7s/holochart-express';

declare const countries: object[];
hx.scatter(countries, {
  x: 'gdpPercap',
  y: 'lifeExp',
  color: 'continent',
  logX: true,
  trendline: 'lowess',
  trendlineOptions: { frac: 0.5 },
  trendlineScope: 'overall',
});
```

### Fit results

`getTrendlineResults(figure)` is plotly.py's `px.get_trendline_results(fig)`: one entry per OLS
trendline, with the group it was fit on and the fit — coefficients, R², standard errors,
t statistics and p-values, as statsmodels' `OLSResults` names them.

```ts
import hx from '@mk7s/holochart-express';

declare const tips: object[];
const figure = hx.scatter(tips, { x: 'total_bill', y: 'tip', color: 'sex', trendline: 'ols' });
for (const { groups, fit, traceIndex } of hx.getTrendlineResults(figure)) {
  const [intercept, slope] = fit.params;
  console.log(groups['sex'], slope, intercept, fit.rsquared, fit.pvalues[1], traceIndex);
}
```

| Field          | What it holds                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| `groups`       | The group's values by column label (`{ sex: 'Female' }`); `{}` for `'overall'`                                     |
| `traceIndex`   | Index of the trendline trace in `figure.data` (and in each frame)                                                  |
| `frame`        | The frame's name, for animated figures                                                                             |
| `fit`          | `params`, `paramNames`, `rsquared`, `rsquaredAdj`, `bse`, `tvalues`, `pvalues`, `nobs`, `dfResid`, `ssr`, `fitted` |
| `logX`, `logY` | Whether x / y were fit on their logarithms                                                                         |

The results are kept beside the figure object, not inside it: the figure stays plain Plotly JSON,
and like plotly.py (which keeps them on the Python figure only) they don't survive `chartToJSON`,
`structuredClone` or a copy. Pass the figure Express returned, or the chart it rendered
(`const chart = await hx.scatter(el, …)`). LOWESS and the moving-window kinds have no fit results,
as in px. The fitting functions are exported too: `ols`, `lowess`, `rolling`, `expanding`, `ewm`.

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
