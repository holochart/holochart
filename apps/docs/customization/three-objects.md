---
title: Adding your own three.js objects
description: Add custom three.js objects to a chart, positioned in data, paper, or world coordinates.
status: stub
milestone: M7
---

# Adding your own three.js objects

This page will explain how to combine a chart with your own three.js content.

Planned topics:

- `chart.addObject(object3D, { subplot, coords, followZoom })`
- Converting between data and world coordinates with `chart.dataToWorld` and `worldToData`
- Accessing `chart.three.scene`, `chart.three.renderer`, and a trace's objects with
  `chart.getTraceObjects`
- Render hooks: `beforerender` and `afterrender`
- Making custom objects hoverable
- Using the same `three` instance as Holochart (why `three` is a peer dependency)

See also [Core concepts](/getting-started/core-concepts#escape-hatches).
