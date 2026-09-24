---
title: Migration guides
description: Step-by-step guides for upgrading between Holochart versions with breaking changes.
status: stub
milestone: M7
---

# Migration guides

This page will collect a guide for every release with breaking changes, with before-and-after code
and codemods where feasible.

## Unreleased: a new default look

Charts without `layout.template` now use Holochart's own dark, dense `holochart` template instead
of Plotly's look. The theme that used to be called `holochart` (Plotly's look spelled out) is now
`plotly-classic`, and `holochart-dark` is a deprecated alias of the new `holochart`, removed
before 1.0.

- To keep the previous look everywhere, call `setDefaultTemplate('plotly-classic')` once, before
  creating charts, or set `layout.template: 'plotly-classic'` per figure.
- Figures that set `template: 'holochart'` to get the white look: change it to
  `'plotly-classic'`.
- Figure JSON is unaffected: `chartToJSON` exports your figure, not the template.

See [Coming from Plotly](/getting-started/from-plotly#default-look) for what differs.

## Versioning

Holochart follows semantic versioning. Deprecated APIs keep working for at least one minor version
and log a console warning before they are removed.

Moving from another library? See [Coming from Plotly](/getting-started/from-plotly),
[Coming from d3](/getting-started/from-d3), and
[Coming from Chart.js](/getting-started/from-chartjs).
