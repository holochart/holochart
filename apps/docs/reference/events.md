---
title: Events
description: Every event a Holochart chart emits, when it fires, and what its payload contains.
status: complete
---

# Events

Subscribe to chart events with `chart.on` and unsubscribe with `chart.off`:

```ts
import type { PointerEventData } from '@mk7s/holochart';

function onClick(event: PointerEventData) {
  for (const point of event.points) {
    console.log(point.curveNumber, point.pointNumber, point.x, point.y);
  }
}

chart.on('click', onClick);
// later
chart.off('click', onClick);
```

`chart.on` also returns a function that unsubscribes, `chart.once` listens for one event only, and
`chart.off(name)` without a listener removes every listener of that event. Listeners may
unsubscribe while the event is being dispatched.

A listener that throws doesn't stop the other listeners or the chart: hover labels, zoom, pending
updates and the `afterplot` event carry on as usual. The error is reported with the browser's
`reportError`, so it shows up in the console and in error trackers as an uncaught error. The same
applies to `config.renderHover` (the built-in labels are drawn instead) and to custom modebar
buttons.

## Event list

The payloads are typed: [`ChartEvents`](/reference/api/holochart/interfaces/ChartEvents) in the API
reference maps each event name to its payload type, so `chart.on` infers the listener's argument.

| Event                   | When it fires                                                                                                                         | Payload                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `click`                 | Data points are clicked (with `clickmode` including `'event'`, the default)                                                           | `points[]`, `event`                                                                   |
| `doubleclick`           | The plot area is double-clicked, after the double-click reset or selection clearing ran                                               | none                                                                                  |
| `hover`                 | The pointer moves onto different points, or `chart.hover()` is called                                                                 | `points[]`, `event`, `xvals` and `yvals` (the pointer position in data units)         |
| `unhover`               | The hovered points are gone: the pointer moved off them or left the chart, or `chart.unhover()`                                       | `points` (empty), `event`                                                             |
| `sunburstclick`         | A sunburst sector is clicked, before `click`                                                                                          | `points[]` (the sector), `nextLevel`; return `false` to cancel the drill-down         |
| `treemapclick`          | A treemap tile or path bar segment is clicked, before `click`                                                                         | `points[]` (the tile), `nextLevel`; return `false` to cancel the drill-down           |
| `icicleclick`           | An icicle cell or path bar segment is clicked, before `click`                                                                         | `points[]` (the cell), `nextLevel`; return `false` to cancel the drill-down           |
| `selecting`             | During a box or lasso selection drag, once per animation frame                                                                        | `points[]`, `range` or `lassoPoints`, `selections`, `event`                           |
| `selected`              | A box or lasso selection completes, or a point is click-selected (`clickmode: 'select'`)                                              | `points[]`, `range` or `lassoPoints`, `selections`, `event`                           |
| `deselect`              | The selection is cleared (a double-click, or a click on empty space in a select drag mode)                                            | none                                                                                  |
| `relayout`              | Layout changed (zoom, pan, `chart.relayout`, `chart.update`)                                                                          | The changed layout paths and values                                                   |
| `relayouting`           | During a drag or scroll zoom or pan, once per animation frame; a `relayout` follows at the end                                        | The axis ranges shown so far, as layout paths (`'xaxis.range[0]'`, …)                 |
| `restyle`               | Trace attributes changed (`chart.restyle`, `chart.updateAttributes`, a drill-down, a sankey node drop). Not emitted by `chart.update` | `update` (the changed paths and values) and `traces` (their indices)                  |
| `redraw`                | Data added with `chart.extendTraces` or `chart.prependTraces` has been drawn                                                          | `kind` (`'extend'` or `'prepend'`), `update`, `traces`, `maxPoints`                   |
| `resize`                | The figure size changed (a container resize with `config.responsive`, or a `relayout`)                                                | `width` and `height` in CSS pixels                                                    |
| `clickannotation`       | An annotation with `captureevents: true` (or an editable one) is clicked                                                              | `index` in `layout.annotations`, `annotation`, `fullAnnotation`, `event`              |
| `legendclick`           | A legend item is clicked                                                                                                              | `curveNumber`, `data`, `fullData`, `label`; return `false` to cancel the toggle       |
| `legenddoubleclick`     | A legend item is double-clicked                                                                                                       | `curveNumber`, `data`, `fullData`, `label`; return `false` to cancel the isolation    |
| `sliderchange`          | A layout slider's active step changes                                                                                                 | `slider`, `step`, `interaction`, `previousActive`                                     |
| `sliderstart`           | A pointer drag on a slider starts                                                                                                     | `slider`                                                                              |
| `sliderend`             | The pointer dragging a slider is released                                                                                             | `slider`, `step` (the active step)                                                    |
| `buttonclicked`         | An update-menu button is clicked, after its method ran (unless `execute: false`)                                                      | `menu`, `button`, `active` (the menu's active index after the click), `event`         |
| `animating`             | `animate` starts playing frames                                                                                                       | none                                                                                  |
| `animatingframe`        | An animation frame starts                                                                                                             | `name`, `frame` (the computed frame), `animation` (its `frame` and `transition` opts) |
| `animated`              | An animation finishes (no frame left to play)                                                                                         | none                                                                                  |
| `animationinterrupted`  | Queued frames were dropped (`mode: 'next'` or `'immediate'`)                                                                          | none                                                                                  |
| `transitioning`         | A transition starts (a frame, or `react` with `layout.transition`)                                                                    | none                                                                                  |
| `transitioned`          | A transition finished and its final state is drawn                                                                                    | none                                                                                  |
| `transitioninterrupted` | Another transition cut a transition short                                                                                             | none                                                                                  |
| `afterplot`             | After each update has been drawn (not after each frame of a transition)                                                               | none                                                                                  |
| `beforerender`          | Before each rendered frame                                                                                                            | `time`, `delta`, `frame`, `continuous`                                                |
| `afterrender`           | After each rendered frame                                                                                                             | `time`, `delta`, `frame`, `continuous`                                                |
| `webglcontextlost`      | The browser dropped the WebGL context                                                                                                 | none                                                                                  |
| `webglcontextrestored`  | The WebGL context came back and the chart re-rendered                                                                                 | none                                                                                  |
| `destroy`               | The chart was destroyed (`chart.destroy()` or `purge(el)`)                                                                            | none                                                                                  |

`event` is the DOM event behind a pointer event. It is absent when the event has no DOM event
behind it, such as `chart.hover()` or a click on a hierarchy node.

Frames render only when something changes, so `beforerender` and `afterrender` do not fire on
every browser animation frame. Their payload object is reused between frames; read the three.js
objects from `chart.three` (`scene`, `renderer`, …). See
[three.js objects](/customization/three-objects).

The animation and transition events are covered in more detail in
[Transitions & animation](/fundamentals/transitions-animation#events).

## Points

Each entry in `points[]` describes one point, shaped like Plotly's event points:

| Field                        | Contents                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| `curveNumber`                | Trace index                                                                                  |
| `pointNumber` / `pointIndex` | Index into the trace's data arrays; `[row, column]` for a cell of a `heatmap` or `image`     |
| `pointNumbers`               | Every data index behind an aggregated point (a histogram bin, a stacked segment)             |
| `x`, `y`, `z`                | Data values (numbers, dates, category names); `z` in 3D and on grids                         |
| `customdata`                 | The point's `customdata` entry                                                               |
| `text`, `hovertext`          | The point's `text` and `hovertext` entries                                                   |
| `data`, `fullData`           | The input trace, and the trace after defaults                                                |
| `xaxis`, `yaxis`             | The point's axes                                                                             |
| `bbox`                       | Where the hover label anchors, in container pixels (`x0`, `x1`, `y0`, `y1`; hover and click) |

Traces add fields of their own: pie slices carry `label`, `value` and `percent`, hierarchy nodes
and sankey nodes and links carry the fields listed below. The full type is
[`ChartPoint`](/reference/api/holochart/interfaces/ChartPoint).

## Cancelling default actions

A listener that returns `false` cancels the default action of these events:

- `legendclick`: the visibility toggle of the clicked trace (or legend group).
- `legenddoubleclick`: the isolation of the double-clicked trace.
- `sunburstclick`, `treemapclick` and `icicleclick`: the drill-down, and the `click` event that
  would follow.
- `click` on a sunburst, treemap or icicle: the drill-down.

Every listener still runs; one `false` is enough to cancel. Returning anything else, or nothing,
lets the default happen.

## Hierarchy clicks

A click on a `sunburst` sector, a `treemap` tile or an `icicle` cell (or a treemap or icicle path
bar segment) emits `sunburstclick`, `treemapclick` or `icicleclick` first, then `click` (when
`clickmode` includes `'event'` and `hovermode` is not `false`). If no listener of either returned
`false`, the chart drills to `nextLevel`: it writes it to the trace's `level` with a GUI `restyle`
(so a `restyle` event follows) and animates the change unless reduced motion is on. Clicks during
the drill animation emit their events but don't drill.

The payload, [`HierarchyClickEventData`](/reference/api/holochart/interfaces/HierarchyClickEventData),
has:

- `points`: one point, the clicked node. Besides `curveNumber`, `pointNumber`, `data`, `fullData`,
  `customdata`, `text`, `hovertext` and `bbox`, it carries the node's `label`, `value`, `id`,
  `color`, `parent` (the parent's label; absent on the root), `currentPath` (the labels from the
  root down to the parent, as `'All/A/'`), `entry` (the label of the node currently shown as the
  root), `root` (the hierarchy root's label), and `percentParent`, `percentEntry` and `percentRoot`
  (the node's share of its parent, of the current root, and of the whole, from 0 to 1).
- `nextLevel`: the `level` the click leads to, the id of a node (`''` for the whole hierarchy of a
  trace with several roots):
  - sunburst: the clicked sector, or the level above for the center. It is absent on the root of
    the hierarchy and on leaves, which don't drill.
  - treemap and icicle: the clicked tile (leaves too), the level above for the current root, or
    the clicked path bar segment's node. It is always set; clicking the hierarchy root when it is
    already shown gives its own level and drills nowhere.

Return `false` to keep the chart where it is, for example to open a detail view instead:

```ts
import type { HierarchyClickEventData } from '@mk7s/holochart';

function onSunburstClick(event: HierarchyClickEventData) {
  const node = event.points[0];
  if (node?.['label'] === 'Other') {
    console.log('show details for', node['currentPath']);
    return false; // no drill-down, no click event
  }
  return true;
}

chart.on('sunburstclick', onSunburstClick);
```

See the Interactivity sections of [Sunburst](/charts/hierarchical/sunburst#interactivity),
[Treemap](/charts/hierarchical/treemap#interactivity) and
[Icicle](/charts/hierarchical/icicle#interactivity) for the drill-down itself.

## Sankey nodes and links

A `sankey` trace emits the usual `hover`, `unhover` and `click` events; there is no sankey-specific
event. Each point is either a node or a link, and carries Plotly's fields for it, with
`curveNumber` and `pointNumber` (the node's index in the `node` arrays, or the link's in the
`link` arrays).

| Node field      | Contents                                                       |
| --------------- | -------------------------------------------------------------- |
| `label`         | The node's label                                               |
| `value`         | The node's value                                               |
| `color`         | Its fill color                                                 |
| `customdata`    | Its `node.customdata` entry                                    |
| `depth`         | Its column, from 0                                             |
| `sourceLinks`   | Indices of the links leaving it                                |
| `targetLinks`   | Indices of the links entering it                               |
| `group`         | Whether it is a group node made by `node.groups`               |
| `childrenNodes` | The node indices a group node combines (empty for other nodes) |

| Link field   | Contents                                              |
| ------------ | ----------------------------------------------------- |
| `label`      | The link's label                                      |
| `value`      | The link's value                                      |
| `color`      | Its fill color                                        |
| `customdata` | Its `link.customdata` entry                           |
| `source`     | The source node, with the node fields above           |
| `target`     | The target node, with the node fields above           |
| `flow`       | The links with the same source and target (see below) |

`flow` has `value` (the total of those links), `links` (their indices), `concentration` (this
link's share of the total) and `labelConcentration` (the share of the flow's links with this
link's label).

Only links have `source` and `target`, so a listener can tell the two apart:

```ts
chart.on('click', ({ points }) => {
  const point = points[0];
  if (point?.fullData.type !== 'sankey') return;
  if ('source' in point) {
    const source = point['source'] as { label: string };
    const target = point['target'] as { label: string };
    console.log(`link ${source.label} → ${target.label}: ${String(point['value'])}`);
  } else {
    console.log(`node ${String(point['label'])}`);
  }
});
```

Outside `hovermode: 'closest'`, hovering a link reports every link of its flow. A `hoverinfo`
(or `node.hoverinfo`, `link.hoverinfo`) of `'skip'` turns hover and click events off for that
part. Dropping a dragged node emits a `restyle` of `node.x` and `node.y`. See
[Sankey](/charts/hierarchical/sankey#interactivity).

## Plotly event names

Every event also answers to its Plotly name with a `plotly_` prefix, such as `plotly_click`,
`plotly_relayout` or `plotly_sunburstclick`: `chart.on('plotly_click', …)` subscribes to `click`.
Code written for Plotly event handlers keeps working, on charts made with `createChart` and with
the Plotly-style functional API (`newPlot`, which resolves to the chart) alike.

See also [Interaction & events](/fundamentals/interaction-events).
