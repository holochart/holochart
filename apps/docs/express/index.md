---
title: Express API
description: Build complete charts from tabular data in one call with hx.*, Holochart's plotly.express.
status: complete
---

# Express API

`@mk7s/holochart-express` is Holochart's `plotly.express`: one call turns a table into a complete
figure, with one trace per group, a legend, axis titles, hover text, facets, animation frames and
marginal distributions. It follows plotly.py's `px` closely (the same arguments in camelCase, the
same trace structure), so figures from `px` code translate line by line.

<Example id="express/gapminder" :height="560" />

```ts
import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';

const rows = [
  { country: 'Chad', continent: 'Africa', year: 2007, lifeExp: 50.7, gdpPercap: 1704, pop: 1.0e7 },
  {
    country: 'Peru',
    continent: 'Americas',
    year: 2007,
    lifeExp: 71.4,
    gdpPercap: 7409,
    pop: 2.8e7,
  },
];
const figure = hx.scatter(rows, {
  x: 'gdpPercap',
  y: 'lifeExp',
  color: 'continent',
  size: 'pop',
  hoverName: 'country',
  logX: true,
});
createChart(el, figure);
```

## Two ways to call

Every function takes the data and an options object, and returns the figure as plain data
(`{ data, layout, frames? }`), so you can adjust it before drawing:

```ts
import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';

declare const rows: object[]; // [{ total_bill: 16.99, sex: 'Female', … }, …]
const figure = hx.histogram(rows, { x: 'total_bill', color: 'sex' });
figure.layout['bargap'] = 0.05;
createChart(el, figure);
```

Given an element first, it draws the figure there with `newPlot` and resolves with the chart:

```ts
import hx from '@mk7s/holochart-express';

declare const rows: object[];
const chart = await hx.histogram(el, rows, { x: 'total_bill', color: 'sex' });
```

The figure is ordinary Holochart JSON: `createChart`, `react`, `chart.animate`, `toJSON` and the
rest of the API work on it as on any figure.

## What to register

Express only builds figures; drawing them needs their trace types and components registered. The
`@mk7s/holochart` bundle registers everything and also carries Express as the `express` namespace
(`Holochart.express` in the script-tag build), so with the bundle you need only one import:

```ts
import { express as hx } from '@mk7s/holochart';

declare const rows: object[];
const chart = await hx.scatter(el, rows, { x: 'total_bill', y: 'tip', color: 'day' });
```

With partial bundles, register what the figures use:

```ts
import { register } from '@mk7s/holochart-runtime';
import { basicTraces } from '@mk7s/holochart-traces-basic';
import { statsTraces } from '@mk7s/holochart-traces-stats';
import { builtinComponents } from '@mk7s/holochart-components';

register(...basicTraces, ...statsTraces, ...builtinComponents);
```

`scatter`, `line`, `area`, `bar`, `timeline`, `pie` and `ecdf` use traces-basic; `histogram`,
`box`, `violin`, `strip`, the densities, `scatterMatrix`, `parallelCoordinates`,
`parallelCategories`, marginals and `ff.distplot` use traces-stats too. Facet labels, legends,
colorbars and animation controls are components.

## Functions

| Function                                                         | plotly.py                 | Traces                        |
| ---------------------------------------------------------------- | ------------------------- | ----------------------------- |
| [`scatter`](/express/mappings)                                   | `px.scatter`              | `scatter` (markers)           |
| [`line`](/express/mappings#lines-and-areas)                      | `px.line`                 | `scatter` (lines)             |
| [`area`](/express/mappings#lines-and-areas)                      | `px.area`                 | `scatter` (stacked, filled)   |
| [`bar`](/express/mappings#bars-and-timelines)                    | `px.bar`                  | `bar`                         |
| [`timeline`](/express/mappings#bars-and-timelines)               | `px.timeline`             | `bar` (horizontal, date axis) |
| [`pie`](/express/mappings#pie)                                   | `px.pie`                  | `pie`                         |
| [`histogram`](/express/statistics#histograms)                    | `px.histogram`            | `histogram`                   |
| [`box`, `violin`, `strip`](/express/statistics#box-violin-strip) | `px.box`, `px.violin`, …  | `box`, `violin`               |
| [`ecdf`](/express/statistics#ecdf)                               | `px.ecdf`                 | `scatter` (steps)             |
| [`densityHeatmap`](/express/statistics#densities)                | `px.density_heatmap`      | `histogram2d`                 |
| [`densityContour`](/express/statistics#densities)                | `px.density_contour`      | `histogram2dcontour`          |
| [`scatterMatrix`](/express/statistics#many-dimensions)           | `px.scatter_matrix`       | `splom`                       |
| [`parallelCoordinates`](/express/statistics#many-dimensions)     | `px.parallel_coordinates` | `parcoords`                   |
| [`parallelCategories`](/express/statistics#many-dimensions)      | `px.parallel_categories`  | `parcats`                     |
| [`ff.distplot`](/express/statistics#distplot)                    | `ff.create_distplot`      | `histogram`, `scatter`        |
| [`data.fromCSV`](/express/data#csv)                              | `pd.read_csv`             | —                             |

The rest of plotly.py's catalogue (polar, ternary, 3D, geo, hierarchical charts, `imshow`,
funnels) and trendlines follow with their trace types (M4–M5).

## Options every function shares

| Option                                 | px                                   | What it does                                                       |
| -------------------------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| `labels`                               | `labels`                             | Display names of columns: axis titles, hover lines, legend, facets |
| `title`                                | `title`                              | `layout.title.text`                                                |
| `template`                             | `template`                           | `layout.template`; also where colors and symbols come from         |
| `width`, `height`                      | `width`, `height`                    | Figure size                                                        |
| `categoryOrders`                       | `category_orders`                    | Value orders of columns: traces, legend, facets, frames, axes      |
| `color`, `symbol`, `lineDash`, …       | `color`, `symbol`, `line_dash`, …    | [Grouping columns](/express/mappings#grouping)                     |
| `facetRow`, `facetCol`, `facetColWrap` | `facet_row`, `facet_col`, …          | [Subplot grids](/express/facets)                                   |
| `animationFrame`, `animationGroup`     | `animation_frame`, `animation_group` | [Frames with a player](/express/animation)                         |
| `hoverName`, `hoverData`, `customData` | `hover_name`, `hover_data`, …        | [Hover text](/express/mappings#hover-text)                         |
| `logX`, `logY`, `rangeX`, `rangeY`     | `log_x`, `log_y`, `range_x`, …       | Axis types and ranges, on every facet                              |

Column options take a column name or an array of values (as long as the data); see
[Data input](/express/data).

## The default look

Express leaves `layout.template` unset unless you pass `template`, so figures render in
Holochart's default `holochart` look. Colors, marker symbols and line dashes are still written
into each trace, as px does, taken from the template the figure will use: the default template,
or the `template` option. Pass `template: 'plotly-classic'` (or call
`setDefaultTemplate('plotly-classic')` before building figures) for Plotly's colors.

## Differences from plotly.express

- Options are camelCase (`color_discrete_map` → `colorDiscreteMap`); data are rows, columns, an
  Arrow table or a parsed CSV instead of a pandas DataFrame; results are plain figure objects,
  not `go.Figure` instances.
- Wide-form data (a list of columns for `y`) is not supported yet; use long-form rows.
- Scatter traces are always `scatter` (px switches to `scattergl` above 1000 rows; every Holochart
  trace is GPU-rendered).
- Animated figures keep every group's trace in every frame (empty when a group has no rows that
  frame), so frames line up with the figure's traces by index, and axis ranges are fixed across
  frames when not given ([details](/express/animation#fixed-axis-ranges)).
- Wrapped facets drop the empty cells at the end of the last row and keep tick labels on the
  lowest cell of each column.
- Facet labels are named annotations (`name: 'facet label'`), so the default look's top legend
  makes room for them.
- `parallelCoordinates` and `parallelCategories` put their colorscale on the trace
  (`line.colorscale`, `line.showscale`) instead of `layout.coloraxis`.
- Fill patterns (`pattern`) group traces and name them, but patterns are drawn from plan E8.10.
- Not yet: `trendline` (M5), `marginal` on `line` / `bar`, `text_auto`, `render_mode`,
  `color_discrete_map` given as a Plotly `px.colors` object.
