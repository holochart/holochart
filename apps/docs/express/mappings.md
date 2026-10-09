---
title: Mappings & colors
description: Map columns to positions, colors, symbols, dashes, sizes and hover text; grouping, legends, colorscales and aggregation in Express; funnels, polar charts, maps and networks.
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

`x` and `y` name the position columns. Functions with an orientation (`bar`, `funnel`,
`histogram`, `box`, `violin`, `strip`, `ecdf`, `scatter`, `line`, `area`) decide it as px does: an explicit
`orientation: 'v' | 'h'` wins; with only one of `x` / `y`, a histogram or ECDF of `y` and a bar or
box of `x` are horizontal; with both, the chart is horizontal when `x` is numeric and `y` is not.

## Grouping

Grouping columns split the rows into groups, and each group becomes one trace:

| Option                 | px                       | Each group gets                                            | Sequence (default)                                                 |
| ---------------------- | ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `color`                | `color`                  | `marker.color` (lines: `line.color`)                       | the template's colorway                                            |
| `symbol`               | `symbol`                 | `marker.symbol`                                            | template's scatter symbols, else circle, diamond, square, x, cross |
| `lineDash`             | `line_dash`              | `line.dash` (`line`, `ecdf`)                               | solid, dot, dash, longdash, dashdot, longdashdot                   |
| `pattern`              | `pattern_shape`          | `marker.pattern.shape` (`bar`, `histogram`, `timeline`)    | `''`, `/`, `\`, `x`, `+`, `.`                                      |
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

When `color` is numeric (on `scatter`, `bar`, `timeline`, `pie`, `scatterPolar`, `barPolar`,
`scatterMatrix`, and the parallel charts), it maps through a colorscale instead of grouping: the values go to
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

## Aggregating rows

`agg` on `bar`, `line` and `area` aggregates the rows of each group that share a position — the
x of a vertical chart, the y of a horizontal one — into one bar or point, so row-level data needs
no grouping first. It is a Holochart extension: px's `bar` and `line` draw every row as given
(`px.histogram`'s `histfunc` aggregates over bins instead).

<Example id="express/bar-agg" :height="400" />

```ts
import hx from '@mk7s/holochart-express';

declare const tips: object[];
hx.bar(tips, { x: 'day', y: 'tip', color: 'sex', agg: 'avg', barmode: 'group' });
hx.bar(tips, { x: 'day', agg: 'count' }); // rows per day
hx.line(tips, { x: 'size', y: 'total_bill', agg: 'median' });
```

| `agg`      | Each position gets                                                                |
| ---------- | --------------------------------------------------------------------------------- |
| `'sum'`    | The sum of the values (0 when all are missing)                                    |
| `'avg'`    | Their mean                                                                        |
| `'count'`  | The number of values present; without a value column, of rows                     |
| `'min'`    | The smallest value                                                                |
| `'max'`    | The largest value                                                                 |
| `'median'` | The median                                                                        |
| a function | `fn(values)` of the values present, e.g. `(v) => Math.max(...v) - Math.min(...v)` |

Groups are split by `color`, `pattern`, `lineDash`, facets and frames as usual, and aggregated
within each. Missing values are skipped, and rows without a position are dropped. Positions keep
the order they first appear in (sort the rows first for lines). The value axis and hover label are
titled like a histogram's: `sum of tip`, `avg of tip`, `count`, or the function's name. With only
`x` (or only `y`) and `agg: 'count'`, the bars count rows, vertical for `x`. Other per-row columns
(`text`, `hoverName`, `hoverData`) show the first row of each position.

## Pie

`pie` takes `names` (sector labels) and `values` (sizes; rows with the same name add up), with
`hole` for a donut. `color` colors the sectors, from the colorway or `colorDiscreteMap`, or through
a colorscale when numeric. A `categoryOrders` entry for `names` orders the sectors clockwise.
Facets give one pie per cell.

## Funnels

`funnel` is `px.funnel`: one `funnel` trace per `color` group, with the stages on the category
axis and the counts as bar widths, stacked per stage; the orientation follows px (horizontal when
x holds the numbers). It takes facets and animation frames like `bar`, and `text` and `opacity`.

<Example id="express/funnel" :height="400" />

```ts
import hx from '@mk7s/holochart-express';

declare const rows: object[]; // [{ stage: 'Website visit', office: 'Montreal', number: 39 }, …]
hx.funnel(rows, { x: 'number', y: 'stage', color: 'office' });
```

`funnelArea` is `px.funnel_area`: one `funnelarea` trace with a stage per `names` value sized by
`values`, like a pie. `color` colors the stages, always as categories (px has no colorscale
here), from the colorway or `colorDiscreteMap`, and is listed in the hover label;
`colorDiscreteSequence` also becomes `layout.funnelareacolorway`. Draw both with traces-finance.

<Example id="express/funnel-area" :height="400" />

## Polar charts

`scatterPolar`, `linePolar` and `barPolar` are `px.scatter_polar`, `px.line_polar` and
`px.bar_polar`: `r` and `theta` columns on one `polar` subplot, grouped as `scatter`, `line` and
`bar` are (`color`, `symbol`, `size` and a continuous `color`; `lineDash`, `lineGroup`, `markers`,
`lineShape`; `pattern` and `base`), with animation frames. As in px, the angular axis runs
clockwise from the top; `theta` can be degrees or categories such as compass points. Draw them
with traces-sci.

<Example id="express/bar-polar" :height="480" />

```ts
import hx from '@mk7s/holochart-express';

declare const wind: object[]; // [{ direction: 'NNE', strength: '0-1', frequency: 0.5 }, …]
hx.barPolar(wind, { r: 'frequency', theta: 'direction', color: 'strength' });
hx.scatterPolar(wind, { r: 'frequency', theta: 'direction', color: 'strength', size: 'frequency' });
hx.linePolar(wind, { r: 'frequency', theta: 'direction', color: 'strength', lineClose: true });
```

| Option       | px            | What it does                                                                 |
| ------------ | ------------- | ---------------------------------------------------------------------------- |
| `direction`  | `direction`   | `'clockwise'` (default) or `'counterclockwise'`                              |
| `startAngle` | `start_angle` | Where the angular axis starts, degrees from east (default 90: top)           |
| `rangeR`     | `range_r`     | Radial range (data units, also on a log axis)                                |
| `rangeTheta` | `range_theta` | The sector drawn, `[start, end]` in degrees                                  |
| `logR`       | `log_r`       | Log radial axis                                                              |
| `lineClose`  | `line_close`  | `linePolar`: close each line back to its first point                         |
| `barmode`    | `barmode`     | `barPolar`: `'relative'` (default) and `'stack'` stack, `'overlay'` overlaps |

<Example id="express/scatter-polar" :height="480" />

<Example id="express/line-polar" :height="480" />

## 3D charts {#3d-charts}

`scatter3d` and `line3d` are `px.scatter_3d` and `px.line_3d`: `x`, `y` and `z` columns on one 3D
`scene`, grouped as `scatter` and `line` are (`color`, `symbol`, `size`, `opacity` and a continuous
`color` on `coloraxis`; `lineDash`, `lineGroup` and `markers`), with `text`, hover options, error
bars (`errorX` … `errorZMinus`) and animation frames. The scene's axes take their titles from
`labels`, and `logX` / `logY` / `logZ`, `rangeX` / `rangeY` / `rangeZ` and `categoryOrders`, as
px's `configure_3d_axes` writes them. Like px, the 3D functions have no facets or marginals. Draw
them with traces-3d (the `@mk7s/holochart` bundle includes it); see
[3D scatter](/charts/3d/scatter3d) for the trace and [3D scenes](/fundamentals/3d-scenes) for the
camera, aspect and lighting.

<Example id="express/scatter3d" :height="480" />

```ts
import hx from '@mk7s/holochart-express';

declare const iris: object[]; // [{ sepal_length: 5.1, sepal_width: 3.5, petal_width: 0.2, … }]
hx.scatter3d(iris, { x: 'sepal_length', y: 'sepal_width', z: 'petal_width', color: 'species' });
hx.scatter3d(iris, {
  x: 'sepal_length',
  y: 'sepal_width',
  z: 'petal_width',
  color: 'petal_length', // numeric: a colorscale
  size: 'petal_length',
  sizeMax: 18,
  symbol: 'species',
  opacity: 0.7,
});

declare const gapminder: object[]; // [{ country: 'France', year: 1952, gdpPercap: 7030, … }]
hx.line3d(gapminder, { x: 'gdpPercap', y: 'pop', z: 'year', color: 'country', markers: true });
```

| Option                  | px                         | What it does                                      |
| ----------------------- | -------------------------- | ------------------------------------------------- |
| `x`, `y`, `z`           | `x`, `y`, `z`              | Columns on the scene's axes (z is up)             |
| `logZ`, `rangeZ`        | `log_z`, `range_z`         | The z axis' type and range, like `logX`, `rangeX` |
| `errorZ`, `errorZMinus` | `error_z`, `error_z_minus` | z error bars (`error_z.array`, `arrayminus`)      |
| `lineGroup`, `markers`  | `line_group`, `markers`    | `line3d`: lines within a color, markers           |

<Example id="express/scatter3d-continuous" :height="480" />

<Example id="express/line3d" :height="480" />

An animated 3D scatter (`animationFrame`, `animationGroup`) moves the points between frames inside
a scene whose ranges hold still:

<Example id="express/scatter3d-animated" :height="560" />

## Maps

`scatterGeo`, `lineGeo` and `choropleth` are `px.scatter_geo`, `px.line_geo` and `px.choropleth`:
places on a `geo` subplot, given as `lat` and `lon` columns or as a `locations` column of country
codes, state codes, country names or the ids of your own `geojson`. `scatterGeo` and `lineGeo`
group as `scatter` and `line` do (`color`, `symbol`, `size`, `opacity` and a continuous `color` on
`coloraxis`; `lineDash`, `lineGroup` and `markers`), with `text` and the hover options.
`choropleth` fills the regions that `locations` name by `color`: a numeric column through a
colorscale on `coloraxis`, any other column with one color and legend item per value.

Maps are not part of the `@mk7s/holochart` bundle, so that apps without one do not pay for them.
The Express functions are in the bundle and only build figures; drawing a map takes one more
import, which registers the `geo` subplot and its traces:

<Example id="express/scatter-geo" :height="480" />

```ts
import '@mk7s/holochart/geo';
import hx from '@mk7s/holochart-express';

declare const countries: object[]; // [{ iso: 'FRA', continent: 'Europe', pop: 68, lifeExp: 82.5 }, …]
hx.scatterGeo(countries, {
  locations: 'iso',
  color: 'continent',
  size: 'pop',
  projection: 'natural earth',
});
hx.choropleth(countries, { locations: 'iso', color: 'lifeExp', scope: 'europe' });

declare const stops: object[]; // [{ route: 'A', lat: 48.86, lon: 2.35 }, …]
hx.lineGeo(stops, { lat: 'lat', lon: 'lon', color: 'route', markers: true });

declare const districts: object; // a GeoJSON FeatureCollection
declare const votes: object[]; // [{ district: 'Northside', turnout: 0.61 }, …]
hx.choropleth(votes, {
  geojson: districts,
  featureIdKey: 'properties.name',
  locations: 'district',
  color: 'turnout',
  fitBounds: 'geojson',
});
```

| Option           | px                | What it does                                                                                |
| ---------------- | ----------------- | ------------------------------------------------------------------------------------------- |
| `lat`, `lon`     | `lat`, `lon`      | `scatterGeo`, `lineGeo`: columns of degrees north and east                                  |
| `locations`      | `locations`       | Column of places: the regions of a choropleth, or where markers and lines go                |
| `locationMode`   | `locationmode`    | `'ISO-3'` (default), `'USA-states'`, `'country names'` or `'geojson-id'`                    |
| `geojson`        | `geojson`         | The features `locations` refer to: an object or a URL (passed on, never copied)             |
| `featureIdKey`   | `featureidkey`    | The key of the features matched against `locations` (default `'id'`)                        |
| `projection`     | `projection`      | `geo.projection.type`: `'natural earth'`, `'orthographic'`, `'mercator'`, …                 |
| `scope`          | `scope`           | `geo.scope`: `'world'` (default), `'usa'` or a continent (`'europe'`, `'north america'`, …) |
| `center`         | `center`          | `geo.center`: `{ lat, lon }` at the middle of the map                                       |
| `fitBounds`      | `fitbounds`       | `geo.fitbounds`: `'locations'`, `'geojson'` or `false`                                      |
| `basemapVisible` | `basemap_visible` | `geo.visible`: `false` hides the coastlines, land, borders and frame                        |

`facetRow`, `facetCol` and `facetColWrap` make one `geo` subplot per value (`geo`, `geo2`, …, laid
out like the [facet grid](/express/facets)); the projection, scope, center and fit apply to each,
and a continuous `color` shares one colorbar. With `animationFrame` the map gets the frame slider
and holds its view still: `fitbounds` is `false` unless you pass `fitBounds`, since Holochart
would otherwise fit the map to each frame's data. Everything else about the map (base layers,
colors, the graticule, rotation) is in `figure.layout.geo`.

## Networks

`graph`, `chord` and `adjacencyMatrix` draw a network three ways from the same two tables: an
**edge table** with one row per link (the ids of its two ends in `source` and `target`, and a
`weight`), and optionally a **node table** with one row per node (`nodes`), whose `id` column is
what the edges refer to. plotly.py has nothing like them; the options follow its naming.

Like maps, graphs are not part of the `@mk7s/holochart` bundle. The Express functions are, and
only build figures; drawing a `graph` or `chord` takes one more import, which registers the
traces of the [graph package](/fundamentals/graphs#adding-the-package) (`adjacencyMatrix` is a
`heatmap` and needs none). The traces themselves are on the [graph](/charts/graphs/graph) and
[chord](/charts/graphs/chord) pages:

<Example id="express/graph" :height="520" />

```ts
import '@mk7s/holochart/graph';
import hx from '@mk7s/holochart-express';

declare const reviews: object[]; // [{ reviewer: 'Ada', author: 'Bo', count: 9 }, …]
declare const people: object[]; // [{ name: 'Ada', team: 'Platform', role: 'lead' }, …]
hx.graph(reviews, {
  source: 'reviewer',
  target: 'author',
  weight: 'count',
  nodes: people,
  id: 'name',
  color: 'team', // one color and legend item per team
  size: 'degree', // sized by their number of links
  hoverData: ['role'],
  directed: true, // arrowheads
});
hx.chord(reviews, { source: 'reviewer', target: 'author', weight: 'count' });
hx.adjacencyMatrix(reviews, { source: 'reviewer', target: 'author', weight: 'count' });
```

Each call makes one trace. The edge table's options are `source`, `target`, `weight` and the
`link…` ones; every other column option names a column of the node table:

| Option                      | Table | What it does                                                                              |
| --------------------------- | ----- | ----------------------------------------------------------------------------------------- |
| `source`, `target`          | edges | The ids of a link's two ends (defaults `'source'`, `'target'`); `link.source`, `.target`  |
| `weight`                    | edges | `link.value`: the pull of a link in a layout, the width of a ribbon, the value of a cell  |
| `linkLabel`                 | edges | `link.label`, a line of the link hover label                                              |
| `linkColor`, `linkColorMap` | edges | One link color per value, from the map and then the color sequence (links have no legend) |
| `linkHoverData`             | edges | More lines of the link hover label, like `hoverData`                                      |
| `nodes`                     | —     | The node table                                                                            |
| `id`                        | nodes | The ids the edges refer to (default `'id'`)                                               |
| `label`                     | nodes | `node.label` (default: the ids)                                                           |
| `color`                     | nodes | Groups with a legend, or (`graph`, numeric) a colorscale with a colorbar                  |
| `size`, `sizeMax`           | nodes | `graph`: a column, or `'degree'`, `'indegree'`, `'outdegree'`; diameters from 6 px        |
| `symbol`                    | nodes | `graph`: one marker symbol per value (`symbolSequence`, `symbolMap`)                      |
| `x`, `y`                    | nodes | `graph`: positions; with both for every node the graph is drawn as placed                 |
| `value`                     | nodes | `graph`: `node.value`, for dendrogram heights and for tree and hive orders                |
| `hoverName`, `hoverData`    | nodes | The bold first line and more lines of the node hover label; `customData` as elsewhere     |
| `directed`                  | —     | `graph`: arrowheads. `chord`: the trace's `directed`. `adjacencyMatrix`: rows are sources |
| `arrangement`, `force`, …   | —     | `graph`: the layout and its options, passed to the trace (see below)                      |

- **Nodes** are the rows of the node table, in order, followed by the ids that only the edges
  name, in order of first appearance. So a node without links is drawn, and a node without a row
  is too, with its id as its label and no group. Ids that print the same (`1` and `'1'`) are one
  node. Edge rows without both ends and node rows without an id are skipped; an id on two node
  rows is an error.
- **Without a node table** the nodes come from the edges alone. Options that name node columns
  then have nothing to name: `size: 'degree'` works, and so do arrays with one value per node.
- **`color`** groups the nodes like any Express `color`: the values go to `node.group`, the trace
  gives every group a color of the colorway and a legend item (a click hides the group), and the
  legend is titled with the column. `colorDiscreteSequence`, `colorDiscreteMap` and
  `categoryOrders` choose the colors, which Express writes as `layout.colorway` in the order of
  the groups; `colorDiscreteMap: 'identity'` uses the values as colors. A numeric `color` on
  `graph` is a colorscale on `layout.coloraxis` (`colorContinuousScale`, `rangeColor`,
  `colorContinuousMidpoint`). A chord has no colorscale, so `chord` always groups.
- **`arrangement`** picks the graph's layout (`'force'`, `'layered'`, `'tree'`, `'radial'`,
  `'dendrogram'`, `'circular'`, `'grid'`, `'arc'`, `'hive'`, `'preset'`, `'custom'`), and the
  options `force`, `layered`, `tree`, `arc`, `hive` and `custom` are the trace's containers of
  those names, passed as they are: `{ arrangement: 'layered', layered: { rankdir: 'LR' } }`.
  Left out, the trace decides: as placed when every node has an `x` and a `y`, else `'force'`.
- **Hover labels** list the mapped columns under their names (`labels` renames them), nodes and
  links apart: `name=Ada`, `team=Platform`, `degree=5`; `reviewer=Ada`, `author=Bo`, `count=9`.
- Facets and animation frames are not offered: a figure is one network.

### Chord diagrams

`chord` takes the same tables and the options above that are about data. `weight` is the width of
a ribbon; `color` groups the nodes, which puts the nodes of a group next to each other on the
ring under one outer arc, in one color, with one legend item.

<Example id="express/chord" :height="560" />

It also takes a square matrix, `matrix[i][j]` being the flow from node `i` to node `j`. A matrix
has no node table, so node options are arrays with one value per row (or columns of a `nodes`
table whose rows are in the matrix's order):

```ts
import '@mk7s/holochart/graph';
import hx from '@mk7s/holochart-express';

const trips = [
  [12, 34, 9],
  [31, 8, 22],
  [7, 25, 15],
];
hx.chord(trips, { label: ['Harbor', 'Old Town', 'Campus'], labels: { value: 'Trips' } });
```

### Adjacency matrices

`adjacencyMatrix` draws the network as a heatmap, a row and a column per node and each cell the
summed `weight` of the links between the two (their number without `weight`). It still reads at
densities where a node-link drawing is a hairball. Cells are square, the first node is at the
top, the labels are the ticks of both axes, and `colorContinuousScale`, `rangeColor` and
`colorContinuousMidpoint` style the colorscale. A link fills both cells of its pair unless
`directed` is set, which makes rows sources and columns targets. A matrix given as the data is
shown as it is, reordered.

`order` sorts rows and columns, which is what makes clusters show as blocks on the diagonal:

| `order`       | Rows and columns                                                                   |
| ------------- | ---------------------------------------------------------------------------------- |
| `'input'`     | The nodes' own order (the default without `color`)                                 |
| `'degree'`    | The most connected first, by weight                                                |
| `'group'`     | The nodes of a `color` value together, by degree within (the default with `color`) |
| `'community'` | The same, with the largest group first: for communities given as `color`           |
| `[3, 0, 2…]`  | These node indices, in this order                                                  |

<Example id="express/adjacency-matrix" :height="600" />

Express does not detect communities itself. The graph package has the helper (`louvain`), and
its results line up with Express's nodes:

```ts
import { fromEdgeList, louvain } from '@mk7s/holochart/graph';
import hx from '@mk7s/holochart-express';

declare const mails: Record<string, unknown>[]; // [{ from: 'P4', to: 'P17', messages: 3 }, …]
const network = fromEdgeList(mails, {
  source: 'from',
  target: 'to',
  value: 'messages',
  directed: false,
});
hx.adjacencyMatrix(network, { color: louvain(network), order: 'community' });
```

### Node-link data and measures

The three functions also take **node-link data** in place of the edge table: the `node` and `link`
containers that the adapters of the graph package return (`fromNodeLink` for networkx, d3,
graphology and Cytoscape JSON, `fromDot` for Graphviz text, `fromEdgeList`,
`fromAdjacencyMatrix`). Its labels, groups, positions, values, link values, link labels and
`directed` are used without being named, and any option overrides them.

A measure of the package is an array with one number per node, in the order of the nodes, which
is what a node option takes in place of a column name. Numbers are a colorscale on `graph`; make
them names to get groups with a legend:

```ts
import { fromNodeLink, louvain } from '@mk7s/holochart/graph';
import hx from '@mk7s/holochart-express';

declare const json: unknown; // networkx node_link_data, a graphology export, cy.json(), …
const network = fromNodeLink(json);
const community = Array.from(louvain(network), (c) => `Community ${c + 1}`);
hx.graph(network, { color: community, size: 'degree', labels: { color: 'Community' } });
```

## Templates

The figure's colors are taken from the template it will render with: the `template` option when
given (it is also set as `layout.template`), else the chart's default template (`holochart`, or
what `setDefaultTemplate` chose). Symbols and dashes come from the template's scatter traces when
it cycles them, as in px.
