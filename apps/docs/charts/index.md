---
title: Chart types
description: Every chart type Holochart covers, grouped by family, with its trace type and target milestone.
status: draft
---

# Chart types

Each chart type is drawn by one or more **trace types**. Some chart types are their own trace type
(`bar`, `pie`). Others are a way of configuring an existing one: a line chart is a `scatter` trace
with `mode: 'lines'`. The milestone column shows when each chart type is planned to land. See the
[roadmap](/roadmap) for what each milestone contains.

Only the pages linked below exist so far. Pages for other chart types are added as their traces
land.

## Basic

| Chart                            | Trace type(s)                             | Milestone |
| -------------------------------- | ----------------------------------------- | --------- |
| [Scatter](/charts/basic/scatter) | `scatter` (`mode: 'markers'`)             | M1        |
| [Line](/charts/basic/line)       | `scatter` (`mode: 'lines'`)               | M1        |
| Bubble                           | `scatter` (sized markers)                 | M2        |
| Dot                              | `scatter` (recipe)                        | M2        |
| Area                             | `scatter` (`fill`, `stackgroup`)          | M2        |
| [Bar](/charts/basic/bar)         | `bar`                                     | M1        |
| Horizontal Bar                   | `bar` (`orientation: 'h'`)                | M1        |
| Pie                              | `pie`                                     | M2        |
| Table                            | `table`                                   | M2        |
| Gantt                            | `bar` (with a timeline helper)            | M2        |
| Error Bars                       | `error_x` / `error_y` on `scatter`, `bar` | M1        |

## Statistical

| Chart                | Trace type(s)                                   | Milestone |
| -------------------- | ----------------------------------------------- | --------- |
| Histogram            | `histogram`                                     | M3        |
| 2D Histogram         | `histogram2d`                                   | M3        |
| Density Contour      | `histogram2dcontour`                            | M3        |
| Box                  | `box`                                           | M3        |
| Violin               | `violin`                                        | M3        |
| Strip                | `box` (points only, with a helper)              | M3        |
| ECDF                 | `scatter` (via a helper)                        | M3        |
| Distplot             | `histogram`, `scatter` (via a helper)           | M3        |
| Marginals            | `histogram`, `box`, `violin` on linked subplots | M3        |
| SPLOM                | `splom`                                         | M3        |
| Parallel Coordinates | `parcoords`                                     | M3        |
| Parallel Categories  | `parcats`                                       | M3        |

## Scientific

| Chart      | Trace type(s)                               | Milestone |
| ---------- | ------------------------------------------- | --------- |
| Heatmap    | `heatmap`                                   | M4        |
| Contour    | `contour`                                   | M4        |
| Image      | `image`                                     | M4        |
| Log Plots  | any cartesian trace with `type: 'log'` axes | M1        |
| Polar      | `scatterpolar`                              | M4        |
| Radar      | `scatterpolar` (`fill: 'toself'`)           | M4        |
| Wind Rose  | `barpolar`                                  | M4        |
| Ternary    | `scatterternary`                            | M7        |
| Quiver     | `quiver`                                    | M7        |
| Streamline | `streamline`                                | M7        |
| Dendrogram | `scatter` (via a helper)                    | M7        |
| Carpet     | `carpet`, `scattercarpet`, `contourcarpet`  | M8        |

## Financial

| Chart                 | Trace type(s)                                | Milestone |
| --------------------- | -------------------------------------------- | --------- |
| Time Series           | `scatter`, `bar` on date axes                | M4        |
| OHLC                  | `ohlc`                                       | M4        |
| Candlestick           | `candlestick`                                | M4        |
| Waterfall             | `waterfall`                                  | M4        |
| Funnel                | `funnel`                                     | M4        |
| Funnel Area           | `funnelarea`                                 | M4        |
| Indicators            | `indicator`                                  | M4        |
| Range Slider & Breaks | axis features (`rangeslider`, `rangebreaks`) | M3        |

## Hierarchical & Flow

| Chart    | Trace type(s) | Milestone |
| -------- | ------------- | --------- |
| Sunburst | `sunburst`    | M5        |
| Treemap  | `treemap`     | M5        |
| Icicle   | `icicle`      | M5        |
| Sankey   | `sankey`      | M5        |

## 3D

| Chart            | Trace type(s)            | Milestone |
| ---------------- | ------------------------ | --------- |
| Scatter3D        | `scatter3d`              | M6        |
| Surface          | `surface`                | M6        |
| Mesh3D           | `mesh3d`                 | M6        |
| Cone             | `cone`                   | M6        |
| Streamtube       | `streamtube`             | M6        |
| Volume           | `volume`                 | M6        |
| Isosurface       | `isosurface`             | M6        |
| Bar3D            | `bar3d` (Holochart only) | M6        |
| 3D Axes & Camera | `layout.scene`           | M6        |

## Maps

Maps are a stretch goal, planned after 1.0.

| Chart       | Trace type(s)                         | Milestone |
| ----------- | ------------------------------------- | --------- |
| Scatter Geo | `scattergeo`                          | M8        |
| Choropleth  | `choropleth`                          | M8        |
| 3D Globe    | `scattergeo`, `choropleth` on a globe | M8        |
| Tile maps   | `scattermap`, `choroplethmap`         | M8        |
| Density map | `densitymap`                          | M8        |
