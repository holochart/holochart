---
title: Traces & trace types
description: What a trace is, how its type is chosen, the attributes every trace has, where traces are placed, the order they draw in, and how trace types are registered.
status: complete
---

# Traces & trace types

A **trace** is one data series drawn one way: a line, a set of bars, a pie, a surface. A figure's
`data` is a list of traces, and each trace is a plain object. This page covers what traces have
in common. Every trace type has a page under [chart types](/charts/) and a generated attribute
list under [reference](/reference/).

## The `type` attribute

`type` names the trace type, and the trace type decides which other attributes the trace has. A
trace without `type` is a `scatter` trace, as in Plotly.

```ts
createChart(el, {
  data: [
    { type: 'bar', x: ['Mon', 'Tue', 'Wed'], y: [120, 90, 150], name: 'Orders' },
    { type: 'scatter', mode: 'lines+markers', x: ['Mon', 'Tue', 'Wed'], y: [95, 110, 140] },
  ],
});
```

<Example id="line/with-bars" />

Some chart types are not trace types of their own. A line chart is a `scatter` trace with
`mode: 'lines'`, an area chart is a `scatter` trace with `fill`, and a bubble chart is a `scatter`
trace with an array of marker sizes. The [chart types](/charts/) overview lists which trace type
draws each chart.

A trace whose `type` is not registered is hidden. The rest of the chart draws, and the console
gets one warning, which suggests the nearest registered type when there is one:

```text
[holochart] data[0].type: unknown trace type 'scattergl'; did you mean 'scatter'? (the trace is hidden)
```

Plotly's `scattergl` and `scatterpolargl` are `scatter` and `scatterpolar` in Holochart, since
every trace is drawn on the GPU. See
[Troubleshooting](/guides/troubleshooting#unknown-trace-type) for the other causes.

In TypeScript, `Data` is the union of every trace type, discriminated on `type`, so a typed
figure rejects an unknown `type` and autocompletes the attributes of the one you wrote. Each
trace type is also exported by name (`ScatterTrace`, `BarTrace`, …). See
[TypeScript](/guides/typescript#narrowing-by-trace-type).

## Attribute names

An attribute that Plotly has keeps Plotly's name, letter for letter, in traces, in `layout` and
in `config`: `showlegend`, `showticklabels`, `paper_bgcolor`, `scrollZoom`. Holochart has no
second spelling for these names. A camelCase version, such as `showLegend` or `paperBgcolor`,
is an unknown attribute: it is ignored, and the console warning suggests the Plotly name.

```text
[holochart] layout.paperBgcolor: unknown attribute 'paperBgcolor'; did you mean 'paper_bgcolor'?
```

Names that exist only in Holochart are camelCase: the trace attribute `styleRules`,
`layout.colorscaleInterpolation`, config options such as `sharedRenderer` and `maxPixelRatio`,
and every [Express](/express/) option. The exception is the 3D
[material, lighting](/customization/materials-lighting) and scene attributes that Holochart
adds, such as `castshadow`, `clearcoatroughness` and `autorotate`: they are lower case, like the
Plotly attributes around them.

## Attributes every trace has

These exist on every trace type:

| Attribute     | Default     | What it does                                                                                                      |
| ------------- | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| `type`        | `'scatter'` | The trace type.                                                                                                   |
| `name`        | `'trace N'` | The name in the legend and in hover labels. `N` is the trace's index in `data`.                                   |
| `visible`     | `true`      | `true`, `false` or `'legendonly'`. See [below](#visible).                                                         |
| `showlegend`  | `true`      | Whether the trace has a legend item. Trace types without legend items, such as `table` and `sankey`, ignore it.   |
| `legendgroup` | `''`        | Traces with the same group sit together in the legend and toggle together.                                        |
| `legendrank`  | `1000`      | Sort key of the legend item: lower ranks come first, ties keep trace order.                                       |
| `opacity`     | `1`         | Opacity of the whole trace, from 0 to 1. `table`, `parcoords`, `parcats`, `indicator` and `sankey` do not use it. |
| `customdata`  | none        | One value per point, for your own use. See [below](#customdata-and-meta).                                         |
| `meta`        | none        | Any value for the whole trace, for your own use.                                                                  |
| `uid`         | none        | The trace's identity across updates. See [Trace identity](#trace-identity-uid-and-ids).                           |
| `ids`         | none        | One id per point.                                                                                                 |

Every trace also has the hover attributes (`hovertext`, `hoverinfo`, `hovertemplate`,
`hoverlabel`), `legend`, `legendwidth`, `legendgrouptitle`, `selectedpoints`, `uirevision`,
[`dataset`](/fundamentals/data-formats#datasets) and
[`styleRules`](/fundamentals/conditional-styling). They head each trace type's reference page,
for example [scatter](/reference/scatter#visible).
[Legend groups](/fundamentals/layout-axes-subplots#legend-groups-and-group-titles) are described
with the legend.

### `visible`

- `true`: the trace is drawn.
- `false`: the trace is not drawn and has no legend item. Its other attributes are not
  defaulted, so `chart.fullData[i]` holds only the shared ones.
- `'legendonly'`: the trace is not drawn, but its legend item stays, dimmed. A click on a legend
  item switches a trace between `true` and `'legendonly'`.

A trace that is not drawn, `'legendonly'` included, does not count for the automatic range of its
axes.

### `customdata` and `meta`

`customdata` holds one value per point. Holochart does not draw it. It comes back as
`points[i].customdata` in [events](/reference/events), and templates read it as `%{customdata}`,
or `%{customdata[0]}` when each item is an array.

`meta` holds one value for the whole trace. Templates read it as `%{meta}`, `%{meta[0]}` or
`%{meta.key}`.

```ts
const chart = createChart(el, {
  data: [
    {
      type: 'scatter',
      mode: 'markers',
      x: [1, 2, 3],
      y: [12.5, 9.1, 14.2],
      customdata: [
        ['A-17', 'Lyon'],
        ['B-02', 'Porto'],
        ['C-40', 'Turin'],
      ],
      meta: { unit: 'kg' },
      hovertemplate: '%{customdata[1]}: %{y:.1f} %{meta.unit}<extra></extra>',
    },
  ],
});

chart.on('click', (event) => console.log(event.points[0]?.customdata));
```

## Modes and conditional attributes

Some attributes only apply in one state of the trace. A `scatter` trace's `mode` is the usual
case: it is any combination of `'lines'`, `'markers'` and `'text'` joined with `+`, or `'none'`.

- Without `mode`, a scatter trace with fewer than 20 points gets `'lines+markers'`, and a longer
  one gets `'lines'`. A trace in a `stackgroup` gets `'lines'` at any length.
- `marker.*` applies only when `mode` includes `'markers'`, and `textfont` and `textposition`
  only when it includes `'text'`.

Setting an attribute that does not apply is not an error and gives no warning. The attribute is
left out of `chart.fullData`: a scatter trace with `mode: 'lines'` has no `marker` there, whatever
the figure set.

`scatterpolar` and `scatter3d` have a `mode` with the same values.

## Placing traces

A trace names the subplot it is drawn in. Which attribute does that depends on the trace type:

| Trace types                                                                                                                                                      | Placed by                                               | Default             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------- |
| `scatter`, `bar`, `histogram`, `histogram2d`, `histogram2dcontour`, `box`, `violin`, `heatmap`, `image`, `contour`, `ohlc`, `candlestick`, `waterfall`, `funnel` | `xaxis` and `yaxis`                                     | `'x'`, `'y'`        |
| `scatter3d`, `surface`, `mesh3d`, `cone`, `streamtube`, `isosurface`, `volume`, `bar3d`                                                                          | `scene`                                                 | `'scene'`           |
| `scatterpolar`, `barpolar`                                                                                                                                       | `subplot`                                               | `'polar'`           |
| `pie`, `table`, `parcoords`, `parcats`, `funnelarea`, `indicator`, `sunburst`, `treemap`, `icicle`, `sankey`                                                     | `domain`                                                | the whole plot area |
| `splom`                                                                                                                                                          | `xaxes` and `yaxes`: one x and one y axis per dimension |                     |

An axis is named by its id: `'x2'` is `layout.xaxis2`, `'y3'` is `layout.yaxis3`. Scenes and polar
subplots work the same way: `scene: 'scene2'` is `layout.scene2`, and `subplot: 'polar2'` is
`layout.polar2`. An axis or subplot that a trace names exists even when `layout` says nothing
about it.

```ts
createChart(el, {
  data: [
    { type: 'bar', x: ['Q1', 'Q2', 'Q3'], y: [410, 480, 530], name: 'Revenue' },
    { type: 'scatter', x: ['Q1', 'Q2', 'Q3'], y: [0.31, 0.34, 0.38], name: 'Margin', yaxis: 'y2' },
  ],
  layout: { yaxis2: { overlaying: 'y', side: 'right', tickformat: '.0%' } },
});
```

<Example id="axes/revenue-margin" :height="440" />

`domain` places a trace by fractions of the plot area, `{ x: [0, 0.5], y: [0, 1] }`, or by a cell
of [`layout.grid`](/reference/layout#grid) with `row` and `column`:

```ts
createChart(el, {
  data: [
    { type: 'pie', labels: ['Web', 'App'], values: [62, 38], domain: { row: 0, column: 0 } },
    { type: 'pie', labels: ['New', 'Returning'], values: [45, 55], domain: { row: 0, column: 1 } },
  ],
  layout: { grid: { rows: 1, columns: 2 } },
});
```

[Layout, axes & subplots](/fundamentals/layout-axes-subplots) covers grids, overlaid axes and
polar subplots, and [3D scenes](/fundamentals/3d-scenes#several-scenes) covers scenes.

## Trace order

The position of a trace in `data` is its index. The index is:

- the `curveNumber` of the trace's points in events;
- the number that `restyle`, `deleteTraces` and the other update calls take;
- the source of the default name (`trace 0`, `trace 1`, …) and, for trace types drawn in one
  color, of the default color: trace `i` takes color `i` of
  [`layout.colorway`](/reference/layout#colorway), starting over at its end;
- the order of legend items, unless `legendrank`, legend groups or
  [`legend.traceorder`](/reference/layout#legend.traceorder) change it.

On cartesian subplots, the drawing order has three levels:

1. **`zorder`**: a trace with a higher `zorder` draws on top. It is an integer, default `0`, and
   may be negative.
2. **The trace type's layer**, at equal `zorder`, following Plotly's order from bottom to top:
   images, heatmaps, contours, funnels, waterfalls, bars, violins, boxes, OHLC and candlesticks,
   scatter. So a bar trace listed after a line still draws below it.
3. **Trace order**, within a layer: later traces draw over earlier ones.

```ts
createChart(el, {
  data: [
    { type: 'scatter', mode: 'lines', x: [1, 2, 3], y: [2, 4, 3] },
    // Without zorder, these bars would draw under the line.
    { type: 'bar', x: [1, 2, 3], y: [3, 1, 2], zorder: 1 },
  ],
});
```

The trace types in the first row of the [placement table](#placing-traces) have `zorder`. Other
trace types do not: there it is an unknown attribute.

## Trace identity: `uid` and `ids`

`uid` tells [`react`](/fundamentals/updating-charts) which trace of the new figure is which trace
of the old one:

- A trace with a `uid` matches the old trace with the same `uid`, wherever it is in `data`. A
  reordered trace is moved and keeps its GPU objects.
- Traces without a `uid` match by position among the other traces without one.
- A matched pair whose `type` differs is removed and created again.

Holochart does not generate a `uid`: a trace without one has none in `chart.fullData`.

`ids` gives each point an id. During a transition, points of the old and the new data are matched
by id when both have `ids`, and by index otherwise; see
[Matching points with `ids`](/fundamentals/transitions-animation#matching-points-with-ids).
`sunburst`, `treemap` and `icicle` also use `ids` as the node ids that `parents` refers to.

## Registering trace types

`@mk7s/holochart` registers every trace type when it is imported. With a
[partial bundle](/getting-started/installation#smaller-bundles-with-partial-packages) you
register the ones you use:

```ts
import { createChart, register } from '@mk7s/holochart-runtime';
import { builtinComponents } from '@mk7s/holochart-components';
import { bar, scatter } from '@mk7s/holochart-traces-basic';

register(scatter, bar, ...builtinComponents);

createChart(el, { data: [{ type: 'bar', x: ['a', 'b'], y: [2, 3] }] });
```

Each trace package exports its trace types one by one, and a list of all of them:

| Package                          | Trace types                                                                                        | List            |
| -------------------------------- | -------------------------------------------------------------------------------------------------- | --------------- |
| `@mk7s/holochart-traces-basic`   | `scatter`, `bar`, `pie`, `table`                                                                   | `basicTraces`   |
| `@mk7s/holochart-traces-stats`   | `histogram`, `histogram2d`, `histogram2dcontour`, `box`, `violin`, `splom`, `parcoords`, `parcats` | `statsTraces`   |
| `@mk7s/holochart-traces-sci`     | `heatmap`, `image`, `contour`, `scatterpolar`, `barpolar`                                          | `sciTraces`     |
| `@mk7s/holochart-traces-finance` | `ohlc`, `candlestick`, `waterfall`, `funnel`, `funnelarea`, `indicator`                            | `financeTraces` |
| `@mk7s/holochart-traces-hier`    | `sunburst`, `treemap`, `icicle`, `sankey`                                                          | `hierTraces`    |
| `@mk7s/holochart-traces-3d`      | `scatter3d`, `surface`, `mesh3d`, `cone`, `bar3d`, `streamtube`, `isosurface`, `volume`            | `traces3d`      |

Two lists hold more than trace types. `traces3d` includes the component that draws 3D scenes
(`sceneComponent`), and `sciTraces` includes the one that draws polar subplots
(`polarComponent`). If you register 3D or polar trace types one by one, register that component
too.

A built-in trace type that was not registered is hidden like any unknown type, and the warning
names its package:

```text
[holochart] data[0].type: unknown trace type 'sankey': `sankey` is in
@mk7s/holochart-traces-hier; import it from there and call `register(sankey)` (the trace is hidden)
```

`registry.list()` returns what is registered:

```ts
import { registry } from '@mk7s/holochart';

console.log(registry.list().traces.map((trace) => trace.type));
```

Registering the same module twice does nothing. Registering a different module under a type that
is taken replaces the first one, with a console warning.

See also [Core concepts](/getting-started/core-concepts) for how traces fit in the figure, and
[Data formats](/fundamentals/data-formats) for what their data arrays accept.
