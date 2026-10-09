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

## Unreleased: a curated export list

`@mk7s/holochart` now exports a list of names instead of everything its packages export. The chart
API, typed figures, the trace and component modules, themes, errors, the documented helpers and
the experimental plugin API are all still there. What is gone is plumbing the packages share with
each other (`layoutBars`, `calcBar`, `supplyColorscaleDefaults`, `stripInternal`, `editDistance`,
`warnOnce`, …), now tagged `@internal`. If you imported one of those, copy the few lines you need:
internal exports carry no compatibility promise.

Some names meant two different things in two packages. Each now has one meaning, and the less
public one was renamed:

| Package                                  | Before                                 | Now                                                |
| ---------------------------------------- | -------------------------------------- | -------------------------------------------------- |
| `@mk7s/holochart-core`, `-runtime`       | `Layout`                               | `BaseLayout` (`Layout` is the full bundle's)       |
| `@mk7s/holochart-core`                   | `LayoutTitle`                          | `BaseLayoutTitle`                                  |
| `@mk7s/holochart-core`, `-runtime`       | `Frame`                                | `FrameInput` (`Frame` is the full bundle's)        |
| `@mk7s/holochart-traces-basic`           | `BarTrace`, `PieTrace`, `ScatterTrace` | `BaseBarTrace`, `BasePieTrace`, `BaseScatterTrace` |
| `@mk7s/holochart-traces-finance`         | `FunnelTrace`, `WaterfallTrace`        | `BaseFunnelTrace`, `BaseWaterfallTrace`            |
| `@mk7s/holochart-traces-hier`            | `IcicleTrace`, `TreemapTrace`          | `BaseIcicleTrace`, `BaseTreemapTrace`              |
| `@mk7s/holochart-traces-sci`             | `HeatmapTrace`                         | `BaseHeatmapTrace`                                 |
| `@mk7s/holochart-traces-basic`           | `TimelineOptions`                      | `TimelineFigureOptions`                            |
| `@mk7s/holochart-traces-stats`           | `StripOptions`                         | `StripFigureOptions`                               |
| `@mk7s/holochart-express`                | `AnimationOptions`                     | `AnimationFrameOptions`                            |
| `@mk7s/holochart-core` (experimental)    | `TraceModule`, `ComponentModule`       | `CoreTraceModule`, `CoreComponentModule`           |
| `@mk7s/holochart-core` (experimental)    | `RGBA`, `Primitive`                    | `RGBAColor`, `PrimitiveValue`                      |
| `@mk7s/holochart-runtime` (experimental) | `pointInPolygon(polygon, x, y)`        | `polygonContains(polygon, x, y)`                   |
| `@mk7s/holochart-render` (experimental)  | `LineOptions`                          | `LinePrimitiveOptions`                             |

The figure types you import from `@mk7s/holochart` did not change: its `BarTrace`, `ScatterTrace`,
`Layout`, `Frame` and the others are the same types as before, and the `Base…` types are what a
partial bundle imports from the packages. The other renames apply to `@mk7s/holochart` too, where
it exported the name: `StripOptions`, `TimelineOptions`, `RGBA`, `Primitive` and `pointInPolygon`.

## Versioning

Holochart follows semantic versioning. Deprecated APIs keep working for at least one minor version
and log a console warning before they are removed. Before 1.0, a minor release (`0.x`) may contain
breaking changes and a patch release never does.

### Stable and experimental APIs

Everything a package exports is stable unless its documentation says `@experimental` or
`@internal`: the chart API (`createChart`, `newPlot`, `react`, `restyle`, …), figures and their
attributes, events, `register` and the built-in trace and component modules, themes, locales and
Express.

An experimental API works and is typed, but it can change in any minor release without a
deprecation period. Your editor shows the tag when you hover the name, and the
[API reference](/reference/api/) marks it. Today that is the plugin API, which becomes stable
with 1.0:

- The `render` namespace (`@mk7s/holochart-render`): GPU primitives, viewports and the render
  root. The `fonts` and `symbols` registries are stable.
- The contracts a custom trace or component implements (`TraceModule`, `ComponentModule` and the
  contexts they receive), and the helpers for writing one, such as `formatTemplate` or
  `linearExtremes`.
- What a module is declared with and built on: the schema DSL (`attr`), the attribute schemas and
  calc types of the built-in traces (`barAttributes`, `BarCalc`), and the 3D scene API
  (`acquireScene`, `sceneFor`).
- The chart members typed by those: `chart.three.root`, `.overlay`, `.viewports` and `.subplot()`,
  and `chart.axes`, `chart.subplots` and `chart.interaction`. `chart.three.renderer` and
  `chart.three.scene` are three.js objects and stable.
- The chart members components call: `chart.emit`, `chart.getCalcdata`, `chart.previewRanges`,
  `chart.commitRanges` and `chart.refreshHover`.

An `@internal` export is not API at all. The `@mk7s/holochart-*` packages export some of their
plumbing for each other (scale and coercion helpers, shared calc and layout code); it is tagged
`@internal`, left out of `@mk7s/holochart` and of the API reference, and can change in any release.

If you write [custom traces](/extending/custom-trace) or
[components](/extending/component-plugin), pin the minor version (`~0.x.y`) and read the changelog
when you upgrade.

Moving from another library? See [Coming from Plotly](/getting-started/from-plotly),
[Coming from d3](/getting-started/from-d3), and
[Coming from Chart.js](/getting-started/from-chartjs).
