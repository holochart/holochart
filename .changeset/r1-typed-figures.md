---
'@mk7s/holochart': minor
'@mk7s/holochart-components': minor
'@mk7s/holochart-core': minor
'@mk7s/holochart-express': minor
'@mk7s/holochart-locales': minor
'@mk7s/holochart-render': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-themes': minor
'@mk7s/holochart-traces-3d': minor
'@mk7s/holochart-traces-basic': minor
'@mk7s/holochart-traces-finance': minor
'@mk7s/holochart-traces-hier': minor
'@mk7s/holochart-traces-sci': minor
'@mk7s/holochart-traces-stats': minor
---

Typed figures. `@mk7s/holochart` exports `Figure`, `Data` (every trace type, discriminated on
`type`), `Layout`, `Config` and `Frame`, generated from the attribute schemas, and
`createChart`, `newPlot`, `react`, `addTraces`, `relayout`, `update` and `toImage` check figures
against them. Each trace package exports its trace types (`ScatterTrace`, …) and their union
(`TracesBasic`, …); core's `FigureInput<D, L>` stays loose by default for partial bundles and
plugins, and plugins add trace types to `TraceTypes`. `restyle` keeps untyped attribute paths.
Published types now also compile under `exactOptionalPropertyTypes`.
