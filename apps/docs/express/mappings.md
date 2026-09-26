---
title: Mappings & colors
description: Map columns to positions, colors, symbols, dashes, sizes and hover text; grouping, legends and colorscales in Express.
status: complete
---

# Mappings & colors

Express options map columns to what the chart shows. Some map values straight onto the traces
(`x`, `y`, `size`, `text`); others **group** the rows (`color`, `symbol`, `lineDash`, …), so each
group becomes its own trace, with its own style and legend entry.

<Example id="express/scatter" :height="440" />

```ts
import hx from '@mk7s/holochart-express';

declare const iris: object[]; // [{ sepal_width: 3.5, sepal_length: 5.1, petal_length: 1.4, species: 'setosa' }, …]
hx.scatter(iris, {
  x: 'sepal_width',
  y: 'sepal_length',
  color: 'petal_length', // numeric: a colorscale
  symbol: 'species', // categorical: one trace per species
  labels: { sepal_width: 'Sepal width (cm)', sepal_length: 'Sepal length (cm)' },
});
```

## Positions and orientation

`x` and `y` name the position columns. Functions with an orientation (`bar`, `histogram`, `box`,
`violin`, `strip`, `ecdf`, `scatter`, `line`, `area`) decide it as px does: an explicit
`orientation: 'v' | 'h'` wins; with only one of `x` / `y`, a histogram or ECDF of `y` and a bar or
box of `x` are horizontal; with both, the chart is horizontal when `x` is numeric and `y` is not.

## Grouping

Grouping columns split the rows into groups, and each group becomes one trace:

| Option                 | px                       | Each group gets                                            | Sequence (default)                                                 |
| ---------------------- | ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `color`                | `color`                  | `marker.color` (lines: `line.color`)                       | the template's colorway                                            |
| `symbol`               | `symbol`                 | `marker.symbol`                                            | template's scatter symbols, else circle, diamond, square, x, cross |
| `lineDash`             | `line_dash`              | `line.dash` (`line`, `ecdf`)                               | solid, dot, dash, longdash, dashdot, longdashdot                   |
| `pattern`              | `pattern_shape`          | `marker.pattern.shape` (`bar`, `histogram`)                | `''`, `/`, `\`, `x`, `+`, `.`                                      |
| `lineGroup`            | `line_group`             | its own line, same style and legend entry (`line`, `area`) | —                                                                  |
| `facetRow`, `facetCol` | `facet_row`, `facet_col` | its own [subplot](/express/facets)                         | —                                                                  |
| `animationFrame`       | `animation_frame`        | its own [frame](/express/animation)                        | —                                                                  |

- A trace's **name** joins its values of `color`, `lineDash`, `symbol` and `pattern`
  (`'Female, Yes'`); `legendgroup` is the same, and the **legend title** names the columns
  (`sex, smoker`). A group shows in the legend once, even when it spans several facets.
- **Order**: groups follow the values' first appearance in the data, unless `categoryOrders` lists
  them: `{ day: ['Thu', 'Fri', 'Sat', 'Sun'] }` puts those first, in that order, the rest after.
  Listed values without rows still take their place in the color sequence (as in px), so a
  subset of the data keeps the colors of the whole.
- **Styles** come from the sequence in that order (`colorDiscreteSequence`, `symbolSequence`,
  `lineDashSequence`, `patternShapeSequence`), after the fixed ones in the map
  (`colorDiscreteMap: { Asia: 'red' }`, `symbolMap`, `lineDashMap`, `patternShapeMap`): values in
  the map take its entry, the others continue the sequence. A map of `'identity'` uses the values
  themselves as colors, symbols or dashes, without legend entries for them.
- Without a grouping column, every trace still gets the first style (the colorway's first color,
  a circle), as px writes it, so facets and frames look alike.

```ts
import hx from '@mk7s/holochart-express';

declare const tips: object[];
hx.scatter(tips, {
  x: 'total_bill',
  y: 'tip',
  color: 'smoker',
  symbol: 'sex',
  colorDiscreteMap: { Yes: '#ea2a37' },
  colorDiscreteSequence: ['#5e74d5', '#118e36'],
  categoryOrders: { sex: ['Male', 'Female'] },
});
```

## Continuous color

When `color` is numeric (on `scatter`, `bar`, `timeline`, `pie`, `scatterMatrix`, and the
parallel charts), it maps through a colorscale instead of grouping: the values go to
`marker.color` with `coloraxis: 'coloraxis'`, and `layout.coloraxis` holds the colorscale and a
colorbar titled with the column's label, as px writes it.

| Option                    | px                          | What it does                                                                                                                 |
| ------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `colorContinuousScale`    | `color_continuous_scale`    | A named scale (`'Viridis'`), a list of colors, or `[position, color]` pairs. Default: the template's `colorscale.sequential` |
| `rangeColor`              | `range_color`               | `[cmin, cmax]`                                                                                                               |
| `colorContinuousMidpoint` | `color_continuous_midpoint` | `cmid`, for diverging scales                                                                                                 |

A list of colors is spread evenly from 0 to 1. Other groupings (`symbol`) still split traces, and
every trace shares the one colorscale.

## Sizes and text

`size` scales marker **areas** (`marker.sizemode: 'area'`) so the largest value is `sizeMax` px
across (default 20): `sizeref` is `2 · max / sizeMax²`, as in px. Sized scatters keep their legend
markers one size (`legend.itemsizing: 'constant'`). `text` draws a column's values at the points
(`mode: 'markers+text'`) or on the bars, and `opacity` sets `marker.opacity`.

## Hover text

Each trace gets px's `hovertemplate`: its group values as fixed text, then one `label=%{…}` line
per mapped column, then nothing in the side box:

```
sex=Female<br>total_bill=%{x}<br>tip=%{y}<br>size=%{marker.size}<extra></extra>
```

| Option       | px            | What it does                                                           |
| ------------ | ------------- | ---------------------------------------------------------------------- |
| `hoverName`  | `hover_name`  | The column in bold on top (`hovertext`)                                |
| `hoverData`  | `hover_data`  | More columns, through `customdata` (`name=%{customdata[0]}`)           |
| `customData` | `custom_data` | Columns put first in `customdata`, e.g. for click handlers; not listed |
| `labels`     | `labels`      | Display names, in the hover lines as in titles                         |

`hoverData` can also be an object, to add columns (`true`), drop lines (`false`) or format them
with a d3 format (`':.2f'`, `'|%Y'`):

```ts
import hx from '@mk7s/holochart-express';

declare const tips: object[];
hx.scatter(tips, {
  x: 'total_bill',
  y: 'tip',
  hoverName: 'day',
  hoverData: { tip: ':.2f', total_bill: false, size: true },
});
```

Histograms and densities list their aggregate (`count=%{y}`, `sum of tip=%{z}`) and skip
`hoverName` / `hoverData`, as in px.

## Lines and areas

`line` draws one line per group in data order (sort the rows by `x` first), with `markers` to show
points and `lineShape` (`'spline'`, `'hv'`, …) for `line.shape`; `lineGroup` splits lines within a
color. `area` stacks them (`stackgroup: '1'`, each filled to the one below), and `groupnorm:
'percent' | 'fraction'` normalizes each x's total.

## Bars and timelines

`bar` draws one `bar` trace per group, stacked by default (`barmode: 'relative'`: positive values
up, negative down), or `'group'` / `'overlay'`; `base` names a column of bar bases. `timeline`
draws px's Gantt chart: a horizontal bar per row from `xStart` to `xEnd` on a date axis
(`base` = the start, `x` = the duration in ms), `barmode: 'overlay'`. Unlike the
[`timeline()` helper](/charts/basic/gantt), rows keep Plotly's bottom-up order.

## Pie

`pie` takes `names` (sector labels) and `values` (sizes; rows with the same name add up), with
`hole` for a donut. `color` colors the sectors, from the colorway or `colorDiscreteMap`, or through
a colorscale when numeric. A `categoryOrders` entry for `names` orders the sectors clockwise.
Facets give one pie per cell.

## Templates

The figure's colors are taken from the template it will render with: the `template` option when
given (it is also set as `layout.template`), else the chart's default template (`holochart`, or
what `setDefaultTemplate` chose). Symbols and dashes come from the template's scatter traces when
it cycles them, as in px.
