---
title: Chart types
description: Compare chart families, find existing chart guides, and browse classified examples.
status: complete
aside: false
pageClass: hc-catalog
---

<script setup>
import FamilyDirectory from '../.vitepress/theme/components/FamilyDirectory.vue';
</script>

# Chart types

Choose a chart family to browse examples, or follow a subtype link to its existing guide.
Each gallery count includes cross-listed examples once within that family.

<FamilyDirectory />

## Trace coverage and roadmap

Each chart type is drawn by one or more **trace types**. Some chart types are their own trace type
(`bar`, `pie`). Others are a way of configuring an existing one: a line chart is a `scatter` trace
with `mode: 'lines'`. The milestone column shows when each chart type is planned to land. See the
[roadmap](/roadmap) for what each milestone contains.

Linked charts have a page, or a section of a page until they get their own. Pages for other chart
types are added as their traces land.

## Basic

| Chart                                          | Trace type(s)                             | Milestone |
| ---------------------------------------------- | ----------------------------------------- | --------- |
| [Scatter](/charts/basic/scatter)               | `scatter` (`mode: 'markers'`)             | M1        |
| [Line](/charts/basic/line)                     | `scatter` (`mode: 'lines'`)               | M1        |
| [Bubble](/charts/basic/bubble)                 | `scatter` (sized markers)                 | M2        |
| [Dot](/charts/basic/scatter#dot-plot)          | `scatter` (recipe)                        | M2        |
| [Area](/charts/basic/area)                     | `scatter` (`fill`, `stackgroup`)          | M2        |
| [Bar](/charts/basic/bar)                       | `bar`                                     | M1        |
| [Horizontal Bar](/charts/basic/horizontal-bar) | `bar` (`orientation: 'h'`)                | M1        |
| [Pie](/charts/basic/pie)                       | `pie`                                     | M2        |
| [Table](/charts/basic/table)                   | `table`                                   | M2        |
| [Gantt](/charts/basic/gantt)                   | `bar` (with a timeline helper)            | M2        |
| [Error Bars](/charts/basic/scatter#error-bars) | `error_x` / `error_y` on `scatter`, `bar` | M1        |

## Statistical

| Chart                                                            | Trace type(s)                                   | Milestone |
| ---------------------------------------------------------------- | ----------------------------------------------- | --------- |
| [Histogram](/charts/statistical/histogram)                       | `histogram`                                     | M3        |
| [2D Histogram](/charts/statistical/histogram2d)                  | `histogram2d`                                   | M3        |
| [Density Contour](/charts/statistical/histogram2d-contour)       | `histogram2dcontour`                            | M3        |
| [Box](/charts/statistical/box)                                   | `box`                                           | M3        |
| [Violin](/charts/statistical/violin)                             | `violin`                                        | M3        |
| [Strip](/charts/statistical/strip)                               | `box` (points only, with a helper)              | M3        |
| [ECDF](/express/statistics#ecdf)                                 | `scatter` (Express `hx.ecdf`)                   | M3        |
| [Distplot](/express/statistics#distplot)                         | `histogram`, `scatter` (`ff.distplot`)          | M3        |
| [Marginals](/express/statistics#marginals)                       | `histogram`, `box`, `violin` on linked subplots | M3        |
| [SPLOM](/charts/statistical/splom)                               | `splom`                                         | M3        |
| [Parallel Coordinates](/charts/statistical/parallel-coordinates) | `parcoords`                                     | M3        |
| [Parallel Categories](/charts/statistical/parallel-categories)   | `parcats`                                       | M3        |

## Scientific

| Chart                                          | Trace type(s)                               | Milestone |
| ---------------------------------------------- | ------------------------------------------- | --------- |
| [Heatmap](/charts/scientific/heatmap)          | `heatmap`                                   | M4        |
| [Contour](/charts/scientific/contour)          | `contour`                                   | M4        |
| [Image](/charts/scientific/image)              | `image`                                     | M4        |
| [Log Plots](/charts/scientific/log-plots)      | any cartesian trace with `type: 'log'` axes | M1        |
| [Polar](/charts/scientific/polar)              | `scatterpolar`                              | M4        |
| [Radar](/charts/scientific/polar#radar-charts) | `scatterpolar` (`fill: 'toself'`)           | M4        |
| [Wind Rose](/charts/scientific/barpolar)       | `barpolar` (stacked)                        | M4        |
| Ternary                                        | `scatterternary`                            | M7        |
| Quiver                                         | `quiver`                                    | M7        |
| Streamline                                     | `streamline`                                | M7        |
| Dendrogram                                     | `scatter` (via a helper)                    | M7        |
| Carpet                                         | `carpet`, `scattercarpet`, `contourcarpet`  | M8        |

## Financial

| Chart                                                                    | Trace type(s)                                | Milestone |
| ------------------------------------------------------------------------ | -------------------------------------------- | --------- |
| [Time Series](/fundamentals/dates-time-series)                           | `scatter`, `bar` on date axes                | M4        |
| [OHLC](/charts/financial/ohlc)                                           | `ohlc`                                       | M4        |
| [Candlestick](/charts/financial/candlestick)                             | `candlestick`                                | M4        |
| [Waterfall](/charts/financial/waterfall)                                 | `waterfall`                                  | M4        |
| [Funnel](/charts/financial/funnel)                                       | `funnel`                                     | M4        |
| [Funnel Area](/charts/financial/funnelarea)                              | `funnelarea`                                 | M4        |
| [Indicators](/charts/financial/indicator)                                | `indicator`                                  | M4        |
| [Range Slider & Breaks](/fundamentals/layout-axes-subplots#range-breaks) | axis features (`rangeslider`, `rangebreaks`) | M3        |

## Hierarchical & Flow

| Chart                                     | Trace type(s) | Milestone |
| ----------------------------------------- | ------------- | --------- |
| [Sunburst](/charts/hierarchical/sunburst) | `sunburst`    | M5        |
| [Treemap](/charts/hierarchical/treemap)   | `treemap`     | M5        |
| [Icicle](/charts/hierarchical/icicle)     | `icicle`      | M5        |
| [Sankey](/charts/hierarchical/sankey)     | `sankey`      | M5        |

## 3D

The [3D overview](/charts/3d/) compares the 3D chart types and summarizes scenes, performance and
the differences from Plotly.

| Chart                                       | Trace type(s)            | Milestone |
| ------------------------------------------- | ------------------------ | --------- |
| [Scatter3D](/charts/3d/scatter3d)           | `scatter3d`              | M6        |
| [Surface](/charts/3d/surface)               | `surface`                | M6        |
| [Mesh3D](/charts/3d/mesh3d)                 | `mesh3d`                 | M6        |
| [Cone](/charts/3d/cone)                     | `cone`                   | M6        |
| [Streamtube](/charts/3d/streamtube)         | `streamtube`             | M6        |
| [Volume](/charts/3d/volume)                 | `volume`                 | M6        |
| [Isosurface](/charts/3d/isosurface)         | `isosurface`             | M6        |
| [Bar3D](/charts/3d/bar3d)                   | `bar3d` (Holochart only) | M6        |
| [3D Axes & Camera](/fundamentals/3d-scenes) | `layout.scene`           | M6        |

## Maps

Projected maps were built ahead of their milestone: the geo subplot, `scattergeo` and
`choropleth` are available. They are in `@mk7s/holochart-traces-geo`, which the full bundle
leaves out, so a page with a map adds `import '@mk7s/holochart/geo'`: see
[Maps](/fundamentals/maps#adding-the-package). The 3D globe and tile maps are planned.

| Chart                                                                   | Trace type(s)                         | Milestone |
| ----------------------------------------------------------------------- | ------------------------------------- | --------- |
| [Scatter on maps](/charts/maps/scattergeo)                              | `scattergeo`                          | M8        |
| [Lines on maps](/charts/maps/scattergeo#great-circle-routes-on-a-globe) | `scattergeo` (`mode: 'lines'`)        | M8        |
| [Bubble map](/charts/maps/scattergeo#bubble-map)                        | `scattergeo` (sized markers)          | M8        |
| [Choropleth](/charts/maps/choropleth)                                   | `choropleth`                          | M8        |
| [Projections & Geo Subplots](/fundamentals/maps)                        | `layout.geo`                          | M8        |
| 3D Globe                                                                | `scattergeo`, `choropleth` on a globe | M8        |
| Tile maps                                                               | `scattermap`, `choroplethmap`         | M8        |
| Density map                                                             | `densitymap`                          | M8        |

## Network graphs

Node-link drawings, chord diagrams and their 3D form are Holochart's own: Plotly.js has no graph
trace. They are in `@mk7s/holochart-traces-graph`, which the full bundle leaves out, so a page
with a network adds `import '@mk7s/holochart/graph'`: see
[Network graphs](/fundamentals/graphs#adding-the-package).

| Chart                                                                       | Trace type(s)                               | Milestone |
| --------------------------------------------------------------------------- | ------------------------------------------- | --------- |
| [Network graph](/charts/graphs/graph)                                       | `graph`                                     | —         |
| [Force-directed graph](/charts/graphs/graph#force-directed-and-forceatlas2) | `graph` (`arrangement: 'force'`)            | —         |
| [Layered diagram (DAG)](/charts/graphs/graph#layered-diagrams)              | `graph` (`arrangement: 'layered'`)          | —         |
| [Tree, radial tree](/charts/graphs/graph#trees)                             | `graph` (`arrangement: 'tree'`, `'radial'`) | —         |
| [Dendrogram](/charts/graphs/graph#dendrogram)                               | `graph` (`arrangement: 'dendrogram'`)       | —         |
| [Arc diagram](/charts/graphs/graph#arc-diagram)                             | `graph` (`arrangement: 'arc'`)              | —         |
| [Hive plot](/charts/graphs/graph#hive-plot)                                 | `graph` (`arrangement: 'hive'`)             | —         |
| [Chord diagram](/charts/graphs/chord)                                       | `chord`                                     | —         |
| [3D network graph](/charts/graphs/graph3d)                                  | `graph3d`                                   | —         |
| [Adjacency matrix](/fundamentals/graphs#the-adjacency-matrix)               | `heatmap` (with a helper)                   | —         |
