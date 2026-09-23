---
title: Updating charts
description: Change a chart after it is created with update, relayout, react, and streaming appends.
status: stub
milestone: M1
---

# Updating charts

This page will explain how to change a chart efficiently once it is on screen.

Planned topics:

- `chart.update` (restyle) and `chart.relayout` with attribute paths such as `'marker.color'` and
  `'xaxis.range[0]'`
- `chart.react` for passing a whole new figure, and how `uid`, `datarevision`, and `uirevision`
  affect it
- Adding, deleting, and moving traces
- Streaming data with `extendTraces` and `prependTraces`, and rolling windows with `maxPoints`
- Edit types: why some updates are cheaper than others
- Promises and when an update has rendered

See also [Core concepts](/getting-started/core-concepts#updates-and-edit-types).
