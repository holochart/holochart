---
title: Interaction & events
description: Zoom, pan, select, and click, and how to respond to them with events.
status: complete
---

# Interaction & events

A chart with x and y axes zooms, pans, selects and reports clicks without any setup. This page
covers what each gesture does, the attributes that change it, and the events it emits. Hover
labels are covered in [Hover, text & templates](/fundamentals/hover-text-templates), and every
event and payload is listed in the [events reference](/reference/events).

3D scenes have their own controls: see [3D scenes](/fundamentals/3d-scenes#controls).
[`config.staticPlot`](/fundamentals/configuration#staticplot) turns every interaction off.

<Example id="scatter/interactive" />

Drag in the example to zoom, double-click to reset, and use the modebar (top right, shown while
the pointer is over the chart) to switch to pan, box select or lasso.

## Drag modes

[`layout.dragmode`](/reference/layout#dragmode) sets what a drag on the plot area does:

| `dragmode`                                                                       | A drag on the plot area                                                              |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `'zoom'` (default)                                                               | Draws a box and zooms the axes to it                                                 |
| `'pan'`                                                                          | Moves the axes with the pointer                                                      |
| `'select'`, `'lasso'`                                                            | Selects the points inside a box or a freehand outline; see [Selections](#selections) |
| `'drawline'`, `'drawrect'`, `'drawcircle'`, `'drawopenpath'`, `'drawclosedpath'` | Draws a shape; see [Drawing](/fundamentals/shapes-images#drawing)                    |
| `false`                                                                          | Nothing. Hover and click still work                                                  |

`'orbit'` and `'turntable'` are modes of 3D scenes and act like `false` on x/y subplots.

```ts
createChart(el, { data, layout: { dragmode: 'pan' } });

// Later, as the modebar buttons do:
chart.setDragmode('select');
```

The [modebar](/fundamentals/configuration#modebar) has buttons for zoom and pan, for box select
and lasso when a trace has points that can be selected, and buttons to zoom in, zoom out,
autoscale and reset the axes.

### Zoom and pan

- **Zoom box.** A drag shorter than 8 px along one direction leaves that axis alone, so a flat
  horizontal drag zooms x only and a vertical one y only.
- **Axis drags.** In every mode except `false`, a drag that starts in the 30 px strip below the
  plot area (x axis) or left of it (y axis) moves that axis alone: from the middle of the strip
  it pans, and from either end (the outer 15%) it stretches the axis, keeping the other end where
  it is.
- **Axes that move together.** An axis that overlays another (`overlaying`) zooms and pans with
  it. Axes linked with [`matches`](/fundamentals/layout-axes-subplots#linked-axes-matches) or
  [`scaleanchor`](/fundamentals/layout-axes-subplots#aspect-lock-scaleanchor) follow.
- **Limits.** [`fixedrange: true`](/reference/layout#xaxis.fixedrange) on an axis keeps it out of
  every zoom, pan and reset. [`minallowed`](/reference/layout#xaxis.minallowed) and
  [`maxallowed`](/reference/layout#xaxis.maxallowed) stop zoom and pan at those values.
- **Events.** A zoom box emits one `relayout` when the pointer is released. A pan or an axis drag
  emits `relayouting` on each frame of the drag and one `relayout` at the end. Hover labels are
  hidden during a drag.

### Scroll zoom

The mouse wheel does not zoom x/y subplots by default: over a chart, it scrolls the page.
[`config.scrollZoom`](/fundamentals/configuration#scrollzoom) turns wheel zoom on:

```ts
createChart(el, { data, layout, config: { scrollZoom: true } });
```

The wheel zooms around the pointer. Over an axis strip it zooms that axis alone. Each step emits
`relayouting`, and one `relayout` follows 300 ms after the wheel stops. Wheel zoom is off when
`dragmode` is `false`.

### Double-click

A double-click on the plot area resets the axes: to their first ranges, or to autorange when they
are already there. [`config.doubleClick`](/fundamentals/configuration#doubleclick) changes that,
and `config.doubleClickDelay` (300 ms) is the longest time between the two clicks. In the
`'select'` and `'lasso'` modes, a double-click clears the selection when there is one. In every
case the chart then emits `doubleclick`.

### Zoom from code

```ts
// Zoom in to half the range around the center; 2 zooms out. All subplots, or one.
chart.zoom(0.5);
chart.zoom(2, { subplot: 'xy' });

// What a double-click does.
chart.resetAxes(); // back to the first ranges
chart.autoscale(); // autorange every axis

// Any range.
chart.relayout({ 'xaxis.range': [0, 10] });
```

Each call returns a promise and emits `relayout`, like the gesture it stands for.
`chart.zoom`, `chart.resetAxes` and `chart.autoscale` leave `fixedrange` axes alone. Ranges set by
the user survive `react` while
[`uirevision`](/fundamentals/updating-charts#keeping-interactions-with-uirevision) stays the same.

## Click and double-click

A press and release within 3 px is a click. When data points are under the pointer, the chart
emits `click` with those points:

```ts
chart.on('click', (event) => {
  const point = event.points[0];
  if (point) console.log(point.curveNumber, point.pointNumber, point.x, point.y, point.customdata);
});
```

- The points are the ones a hover at that position finds, so they follow
  [`hovermode`](/fundamentals/hover-text-templates#hover-modes) and `hoverdistance`: in
  `'closest'` mode one point, in the `'x'` modes one point per trace. A click on empty space
  emits no `click`.
- With `hovermode: false` the chart emits no `click` (and no `hover`). To get clicks without
  labels, keep `hovermode` and set `hoverinfo: 'none'` on the traces.
- Traces with `hoverinfo: 'skip'` are not clicked.
- [`layout.clickmode`](/reference/layout#clickmode) is `'event'` by default. `'event+select'`
  also selects the clicked points: shift adds them to or removes them from the selection, and a
  click on empty space in the plot area clears it. The chart emits `selected` (or `deselect`)
  after `click`. `'select'` selects without emitting `click`, and `'none'` does neither.

Sunburst, treemap and icicle traces emit an event of their own before `click`, and a listener can
cancel the drill-down: see [Hierarchy clicks](/reference/events#hierarchy-clicks). Clicks on
legend items and annotations have their own events too (`legendclick`, `clickannotation`).

## Selections

In `dragmode: 'select'` (box) and `'lasso'`, a drag selects the points inside it in every trace of
the subplot: `selecting` events follow the drag, `selected` ends it, and traces draw their
`selected` / `unselected` styles. Shift adds to the selection. Scatter traces need markers or
text to be selected: a line alone has no points to pick.

```ts
chart.on('selected', (event) => {
  console.log(
    event.points.map((point) => point.pointNumber),
    event.range, // box: { x: [x0, x1], y: [y0, y1] }
    event.lassoPoints, // lasso: { x: [...], y: [...] }
  );
});
chart.on('deselect', () => console.log('selection cleared'));
```

[`layout.selectdirection`](/reference/layout#selectdirection) limits a box: `'h'` selects a band
between two x values, over the full height of the plot, `'v'` a band between two y values, `'d'`
one or the other depending on whether the drag runs more sideways or more up and down, and `'any'`
(default) a free box.

Selections are also layout objects, as in Plotly 2.13+: each box or lasso drag is stored in
[`layout.selections`](/reference/layout#selections) with one `relayout` (replacing the others, or
added to them with shift), and every selection in the layout selects the points inside it
whenever the chart draws. So a selection survives redraws and `react`, can be saved with the
figure and restored, and can be set from code:

```ts
createChart(el, {
  data: [{ type: 'scatter', mode: 'markers', x: [1, 2, 3, 4, 5], y: [2, 4, 3, 5, 1] }],
  layout: {
    dragmode: 'select',
    selections: [
      { type: 'rect', x0: 1.5, x1: 3.5, y0: 2.5, y1: 4.5 },
      { type: 'path', path: 'M4,0 L5.5,0 L5.5,2 Z' },
    ],
  },
});
```

The example starts with two boxes from `layout.selections`, which select points of both traces:

<Example id="selections/box" />

- **`type: 'rect'`** is the box from (`x0`, `y0`) to (`x1`, `y1`); **`type: 'path'`** is a polygon
  (a lasso), `M x,y L x,y … Z`, with `_` between date and time on date axes
  (`2024-03-01_12:00`). Positions are in data units of `xref` / `yref` (default `'x'` / `'y'`):
  dates, category names or indices, and data values on log axes.
- **Outlines** are drawn with `line.color` (default: white on a dark plot background, `#444` on a
  light one), `line.width` (1 px), `line.dash` (`'dot'`) and `opacity` (0.7), clipped to the
  subplot. They move with zoom and pan.
- **Editing** (in the select drag modes): a click on a selection makes it active (drawn solid);
  drag inside the active selection to move it, or drag a box's edge or corner to resize it. Each
  edit is one `relayout` (`'selections[0].x0'`, …) followed by `selected` with the new points.
- **A double-click** on the plot area clears every selection: the chart emits `deselect` and a
  `relayout` of `selections: []`. So does `chart.clearSelection()`.
- **`selectedpoints`**: `chart.fullData[i].selectedpoints` holds the selection in effect, whether
  it came from a drag, a click or `layout.selections`. The input trace is left as given, except
  that setting its `selectedpoints` yourself wins over the layout selections for that trace.
- The `selected` event carries `points`, `range` (box) or `lassoPoints` (lasso), and the new
  `selections`.
- **Polar subplots** select too (scatterpolar markers, barpolar bars), with points carrying `r`
  and `theta`. Their `selected` events have no `range` or `lassoPoints`, and as in Plotly their
  selections aren't stored in `layout.selections` (see
  [polar interactivity](/charts/scientific/polar#interactivity)).

A lasso stored as a `path` on a date axis, restored on load:

<Example id="selections/lasso" />

## Events

Subscribe with `chart.on`, which returns a function that unsubscribes. `chart.off` and
`chart.once` are there too:

```ts
const stop = chart.on('relayout', (edits) => {
  // After a zoom or pan: the new ends of each axis that moved.
  const x0 = edits['xaxis.range[0]'];
  const x1 = edits['xaxis.range[1]'];
  if (x0 !== undefined && x1 !== undefined) console.log('x range', x0, x1);
});

// Later:
stop();
```

The events of the gestures on this page:

| Gesture                                 | Events                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| The pointer moves onto points, then off | `hover`, then `unhover`                                                          |
| Click on points                         | `click`; with `clickmode` including `'select'`, `selected` or `deselect`         |
| Double-click on the plot area           | `doubleclick`, with the `relayout` of the reset or the `deselect` of the clear   |
| Zoom box                                | `relayout` at the release                                                        |
| Pan, axis drag, wheel zoom, pinch       | `relayouting` on each frame, `relayout` at the end                               |
| Box or lasso drag                       | `selecting` on each frame, `selected` at the release, `relayout` of `selections` |
| A selection is moved or resized         | `relayout`, then `selected`                                                      |

The `relayout` of a zoom or pan has the keys `'xaxis.range[0]'` and `'xaxis.range[1]'` for each
axis that moved. The `relayout` of a reset has `'xaxis.range'` and `'xaxis.autorange'`.

Every event also answers to its Plotly name: `chart.on('plotly_click', …)` subscribes to `click`.
The [events reference](/reference/events) has the payload of each event, the fields of a point,
and the events whose default action a listener can cancel.
[Events after an update](/fundamentals/updating-charts#events-after-an-update) lists what the
update calls emit.

## Keyboard

Tab moves focus into the chart's plot area. The arrow keys then move between data points and show
their hover labels, Enter emits `click` for the point, `+` and `-` zoom, Shift with an arrow key
pans, and `0` resets the view. Zoom, pan and reset emit `relayout` with the keys a drag emits.
The legend, update menus, sliders, modebar and range selector buttons follow in the tab order.
`config.a11y.keyboard: false` takes the plot area out of the tab order.

The [accessibility guide](/guides/accessibility#keyboard-access) lists every key, what screen
readers announce and the tab order.

In the example, the plot area is focused and navigated from code (four presses of → and one of
Page Down), so it shows the focus ring and the hover label of the point that was reached:

<Example id="accessibility/keyboard-focus" :height="400" />

## Touch

Mouse, pen and touch all go through the same
[Pointer Events](https://developer.mozilla.org/docs/Web/API/Pointer_events) handling, so every
chart works on phones and tablets without configuration:

- **Tap**: hovers the points under the finger (labels, spike lines, the `hover` event) and emits
  `click`, as a mouse moving there and clicking would. The labels stay after the finger lifts.
- **Tap elsewhere**: moves the hover there, or hides it (`unhover`) on empty space or anywhere off
  the chart.
- **Double tap**: like a double-click, it resets the axes (`config.doubleClick`) and emits
  `doubleclick`. The two taps may be up to 30 px apart.
- **Pinch**: zooms every movable axis of the subplot around the fingers' midpoint, in every 2D
  `dragmode` except `false`.
- **Two-finger drag**: pans; together with a pinch, the data under the fingers follows them.
- **One-finger drag**: what the `dragmode` does with a mouse (a zoom box, a pan, a box or lasso
  selection, a shape). It starts after 10 px of travel; a mouse needs 3.

A pinch or two-finger drag previews the new ranges at the display's frame rate (`relayouting`)
and commits them with one `relayout` when a finger lifts, like a mouse drag; `fixedrange`,
`minallowed` / `maxallowed`, `matches` and `scaleanchor` apply. A second finger cancels a zoom box
or selection in progress; once two fingers were down, the gesture stays a two-finger one until
every finger lifts. Views that take drags (a sankey node, a range slider, a table) keep a drag
their first finger started and ignore extra fingers.

### Page scrolling

A chart on a phone is often as wide as the screen, so it must not swallow the swipes that scroll
the page. The browser decides who gets a touch gesture from the canvas' CSS
[`touch-action`](https://developer.mozilla.org/docs/Web/CSS/touch-action) when the finger lands,
and Holochart sets it to the least the chart needs:

- **`pan-y`** for `dragmode: 'zoom'` (the default), `'pan'` when every y axis is `fixedrange`,
  and sankey and polar charts: a swipe that **starts vertically scrolls the page**; one that
  starts sideways is the chart's (a zoom box may then grow in any direction). Pinches and taps are
  the chart's.
- **`none`** for `dragmode: 'pan'`, `'select'`, `'lasso'` (polar charts included) and the drawing
  modes, and for tables, parcoords, parcats and 3D scenes: every gesture is the chart's, so the
  page doesn't scroll over it.
- **`manipulation`** for `dragmode: false`, charts whose axes are all `fixedrange`, and charts
  without cartesian axes (pie, sunburst, treemap, …): swipes and pinches are the page's; taps
  still hover, click and drill.

So to keep a chart from ever trapping the page on phones, set `dragmode: false` (or `fixedrange`
on its axes): taps keep working, and the modebar, which appears after a tap, switches modes on
demand. With a coarse pointer its buttons grow to 32 px tap targets. Custom trace types whose
views take drags declare what they need with `touchAction` on their module.

The example stacks three charts, one per `touch-action`: `dragmode: 'zoom'` (vertical swipes
scroll the page), `'pan'` (every swipe pans) and `false` (taps only). Try it on a touch screen or
with the device emulation of your browser's developer tools:

<Example id="interaction/touch" />

## Differences from Plotly

- Plotly has no pinch zoom on cartesian subplots. Holochart pinches whatever `config.scrollZoom`
  says (that one is about the mouse wheel).
- Plotly blocks page scrolling over any chart whose `dragmode` isn't `false`. Holochart leaves
  vertical swipes to the page in zoom mode, the default.
- Holochart does not support pinch zoom on polar subplots: their axes drag with one finger.
- Under `dragmode: false`, touch drags of the range slider and of editable shapes and annotations
  go to the page, not to the chart.
- Holochart does not support `layout.newselection`, `layout.activeselection`,
  `layout.selectionrevision` and `config.editSelection`. The vertices of a lasso selection can't
  be dragged one by one.
- Events are subscribed on the chart (`chart.on`), not on the element. See
  [Coming from Plotly](/getting-started/from-plotly#the-same-chart-side-by-side).
