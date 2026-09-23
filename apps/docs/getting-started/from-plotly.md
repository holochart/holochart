---
title: Coming from Plotly
description: How Plotly.js concepts, attributes, and APIs map to Holochart.
status: stub
milestone: M2
---

# Coming from Plotly

This page will help Plotly.js users move to Holochart. The figure model and most attribute names
are the same, so most of the work is in the few places where Holochart differs.

Planned topics:

- What carries over unchanged: `{ data, layout, config, frames }`, attribute names, `hovertemplate`
  syntax, templates, and `restyle`/`relayout`/`react`
- The functional API (`Holochart.newPlot`, `restyle`, `relayout`, `react`) and the `plotly_*`
  event aliases
- The object API (`createChart`) and why the docs prefer it
- No `scattergl` split: every trace is GPU-rendered
- Differences in default look, and deliberate semantic differences
- Importing existing Plotly JSON with the Plotly importer
- Holochart-only features: 3D-native options, style rules, materials, and shader hooks

See also [Core concepts](/getting-started/core-concepts) and the
[Plotly compatibility table](/reference/plotly-compat).
