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
- Keyboard and touch support

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
