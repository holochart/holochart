---
title: Log plots
description: Semilog and log–log charts, with minor grids and colorbars for data that spans orders of magnitude.
status: complete
chart: scatter
---

# Log plots

<ChartOverview />

## Overview

A log axis spaces values by their ratio instead of their difference: 1, 10, 100 and 1,000 are
equally far apart. Use one when data spans several orders of magnitude, or when relative change
matters more than absolute change:

- **Semilog-y** (log y, linear or date x): exponential growth or decay becomes a straight line,
  and equal slopes mean equal growth rates. Compounding returns, epidemics, radioactive decay.
- **Log–log** (both axes log): power laws become straight lines whose slope is the exponent.
  Frequency spectra, allometric scaling, Zipf's law.
- **Semilog-x** (log x): responses to a quantity that varies over decades, such as dose, frequency
  or particle size.

Any cartesian trace can use log axes; set `type: 'log'` on the axis. There is no special trace
type, so this page uses [scatter](/charts/basic/scatter) traces. Pick a linear axis instead when
values can be zero or negative (a log axis cannot show them) or when the audience reads absolute
differences.

## Minimal example

The figure sketch below shows the essential data shape. Open **Complete source** on the live
example for a runnable module with setup, dependencies and cleanup.

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [{ type: 'scatter', mode: 'lines', x: [0, 1, 2, 3, 4], y: [1, 10, 100, 1000, 10000] }],
  layout: { yaxis: { type: 'log' } },
});
```

`yaxis.type: 'log'` turns the y axis into a log axis. The live example compares compounding
savings on a log y axis, where a constant growth rate is a straight line:

<Example id="log/semilog-y" />

## Data format

- Give **plain values** (`y: [1, 10, 100]`), not their logarithms: the axis takes the log.
- Values that are zero or negative have no logarithm. They are left out of the drawing (the line
  breaks there, as for missing values) and out of the autorange.
- **`range` is in exponents** on a log axis, as in Plotly: `range: [0, 3]` shows 1 to 1,000.
  `autorange: 'reversed'` and `autorangeoptions` work as on linear axes.
- Traces never need to know about the axis type: switching `type` between `'linear'` and `'log'`
  with `relayout` redraws the same data.

## Variations

<ChartVariations />

### Log–log

Both axes log: a power law `y = a·xᵏ` is a straight line of slope `k`. Here, city populations
against their rank follow Zipf's law, with a fitted power law on top:

<ExampleLink id="log/log-log" />

### Minor grid

Decades alone make a sparse grid. `minor: { showgrid: true }` adds grid lines at 2, 3, …, 9 within
each decade, and `dtick: 1` keeps major ticks on whole decades. Here a signal decays over five
orders of magnitude on a log y axis:

<ExampleLink id="log/minor-grid" />

### Log colorbars

A colorscale is linear in its values. To color by a quantity that spans decades, color by its
`log10` and label the colorbar with the original values: `colorbar.tickvals` at the exponents and
`ticktext` for the labels (1, 10, 100, 1k …):

<ExampleLink id="log/colorbar" />

### Exponent formats and a minor log grid on both axes

`exponentformat` writes large and small values as SI prefixes (`1µ`), powers of ten (10⁻⁶) or
`e` notation; the log grid can be dotted and the autorange pinned. A noise spectrum on log–log
axes:

<ExampleLink id="axes/noise-spectrum" />

### Reversed log axis

`autorange: 'reversed'` runs a log axis backwards, and `minor.tickvals` can place minor ticks at
meaningful values instead of digits. A Hertzsprung–Russell diagram:

<ExampleLink id="axes/hr-diagram" />

## Styling

- **Ticks:** by default a log axis labels decades (1, 10, 100) and, when there is room, the
  digits between them (2, 5). `dtick: 1` keeps one tick per decade, `dtick: 2` every other decade,
  and `dtick: 'D1'` / `'D2'` all digits or only 2 and 5. `tickformat` (`'.0e'`, `'~s'`) and
  `exponentformat` (`'power'`, `'SI'`, `'e'`, `'none'`) change the labels.
- **Minor labels:** [`minorloglabels`](/reference/layout#xaxis.minorloglabels) chooses how the
  digit ticks between decades are labeled: a small digit (`'small digits'`, the default), the full
  value (`'complete'`) or not at all (`'none'`).
- **Minor ticks and grid:** `minor.ticks`, `minor.showgrid`, `minor.griddash`, `minor.gridcolor`
  and `minor.dtick` style the ticks between the major ones.
- Traces style as usual; the default theme draws the log grid like any other.

## Interactivity

- Zoom and pan are uniform in log space: a drag moves by a ratio, not a difference, and the
  reported ranges (`relayout`) are exponents, as in Plotly.
- Hover labels show the data values (`%{y}` is the value, not its logarithm); format them with
  `hovertemplate` (`%{y:.3s}`).
- A double click resets to the autorange, which spans the positive values only.

## Performance notes

- Log axes cost nothing extra when drawing: values are converted to exponents once, and the GPU
  draws in that linear space, so zoom and pan only change a transform.
- Long lines on log axes are decimated per pixel column like on linear axes (see
  [long and dense series](/fundamentals/dates-time-series#long-and-dense-series)).

## Accessibility notes

- Say that the axis is logarithmic in the axis title or caption ("Population (log scale)"):
  readers otherwise misjudge differences.
- The DOM mirror reads the data values (not exponents) with the axis formatting. See the
  [accessibility guide](/guides/accessibility).
- Minor grids help readers estimate values between decades; keep them light enough not to
  compete with the data.

## Attribute reference

Log plots use the axis attributes: [`xaxis.type`](/reference/layout#xaxis.type),
[`dtick`](/reference/layout#xaxis.dtick),
[`exponentformat`](/reference/layout#xaxis.exponentformat) and
[`minor`](/reference/layout#xaxis.minor). Traces are ordinary scatter traces: see the
[scatter attribute reference](/reference/scatter).

## Related charts

- [Line](/charts/basic/line) and [scatter](/charts/basic/scatter): the traces on these axes.
- [Working with dates & time series](/fundamentals/dates-time-series): semilog-y time series.
- [Layout, axes & subplots](/fundamentals/layout-axes-subplots): axis types, ranges and ticks.
- [Colors & colorscales](/fundamentals/colors-colorscales): colorbars.

## Plotly migration notes

- `type: 'log'`, `dtick` (`'D1'`, `'D2'`, `L<f>`), `range` in exponents, `exponentformat` and
  `minor` work as in Plotly.js.
- Plotly has no log colorscale either; the `log10` + `tickvals` / `ticktext` recipe is the same.
