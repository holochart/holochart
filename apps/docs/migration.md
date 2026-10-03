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
and log a console warning before they are removed. Before 1.0, a minor release (`0.x`) may contain
breaking changes and a patch release never does.

### Stable and experimental APIs

Everything a package exports is stable unless its documentation says `@experimental`: the chart
API (`createChart`, `newPlot`, `react`, `restyle`, …), figures and their attributes, events,
`register` and the built-in trace and component modules, themes, locales and Express.

An experimental API works and is typed, but it can change in any minor release without a
deprecation period. Your editor shows the tag when you hover the name, and the
[API reference](/reference/api/) marks it. Today that is the plugin API, which becomes stable
with 1.0:

- The `render` namespace (`@mk7s/holochart-render`): GPU primitives, viewports and the render
  root. The `fonts` and `symbols` registries are stable.
- The contracts a custom trace or component implements (`TraceModule`, `ComponentModule` and the
  contexts they receive), and the helpers for writing one, such as `formatTemplate` or
  `linearExtremes`.
- The parts of `chart.three` typed by the render package: `root`, `overlay`, `viewports` and
  `subplot()`. `chart.three.renderer` and `chart.three.scene` are three.js objects and stable.

If you write [custom traces](/extending/custom-trace) or
[components](/extending/component-plugin), pin the minor version (`~0.x.y`) and read the changelog
when you upgrade.

Moving from another library? See [Coming from Plotly](/getting-started/from-plotly),
[Coming from d3](/getting-started/from-d3), and
[Coming from Chart.js](/getting-started/from-chartjs).
