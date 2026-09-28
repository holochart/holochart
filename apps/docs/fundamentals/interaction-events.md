---
title: Interaction & events
description: Zoom, pan, select, and click, and how to respond to them with events.
status: draft
---

# Interaction & events

This page will cover the built-in interactions and the events they emit.

Planned topics:

- Drag modes: zoom, pan, box select, and lasso select
- Scroll zoom, double-click reset, and fixed ranges
- The modebar and its buttons
- Subscribing with `chart.on` and unsubscribing with `chart.off`
- Click, hover, selection, and relayout events and their payloads
- Keyboard support (see [Keyboard](#keyboard); for touch, see [Touch](#touch) below)

See also the [events reference](/reference/events).

## Selections

In `dragmode: 'select'` (box) and `'lasso'`, a drag selects the points inside it in every trace of
the subplot: `selecting` events follow the drag, `selected` ends it, and traces draw their
`selected` / `unselected` styles. Shift adds to the selection.

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

<Example id="_dev/selections-rect" />

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
- **A double-click** on the plot area clears every selection (`relayout` of `selections: []`,
  then `deselect`); so does `chart.clearSelection()`.
- **`selectedpoints`**: `chart.fullData[i].selectedpoints` holds the selection in effect, whether
  it came from a drag, a click or `layout.selections`. The input trace is left as given, except
  that setting its `selectedpoints` yourself wins over the layout selections for that trace.
- The `selected` event carries `points`, `range` (box) or `lassoPoints` (lasso), and the new
  `selections`.

<Example id="_dev/selections-lasso" />

## Keyboard

Tab moves into the chart's plot area; the arrow keys then move between data points, with their
hover labels and screen-reader announcements, Page Up / Page Down switch traces, Enter clicks the
point (`click`), `+` / `-` zoom, Shift + arrows pan and `0` resets the view (`relayout`, with the
same keys as a drag). The legend, update menus, sliders, modebar and range selector follow in the
tab order. The [accessibility guide](/guides/accessibility#keyboard-access) lists every key, the
cursor rules and the tab order.

<Example id="_dev/keyboard-navigation" :height="460" />

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
- **`none`** for `dragmode: 'pan'`, `'select'`, `'lasso'` and the drawing modes, and for tables,
  parcoords and parcats: every gesture is the chart's, so the page doesn't scroll over it.
- **`manipulation`** for `dragmode: false`, charts whose axes are all `fixedrange`, and charts
  without cartesian axes (pie, sunburst, treemap, …): swipes and pinches are the page's; taps
  still hover, click and drill.

So to keep a chart from ever trapping the page on phones, set `dragmode: false` (or `fixedrange`
on its axes): taps keep working, and the modebar, which appears after a tap, switches modes on
demand. With a coarse pointer its buttons grow to 32 px tap targets. Custom trace types whose
views take drags declare what they need with `touchAction` on their module.

<Example id="_dev/interaction-touch" />

### Differences from Plotly

- Plotly has no pinch zoom on cartesian subplots. Holochart pinches whatever `config.scrollZoom`
  says (that one is about the mouse wheel).
- Plotly blocks page scrolling over any chart whose `dragmode` isn't `false`. Holochart leaves
  vertical swipes to the page in zoom mode, the default.
- Not yet: pinch zoom on polar subplots (their axes drag with one finger), and touch drags of the
  range slider and editable shapes or annotations under `dragmode: false` (the page takes them).
