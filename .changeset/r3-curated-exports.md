---
'@mk7s/holochart': minor
'@mk7s/holochart-core': minor
'@mk7s/holochart-render': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-components': minor
'@mk7s/holochart-traces-basic': minor
'@mk7s/holochart-traces-stats': minor
'@mk7s/holochart-traces-sci': minor
'@mk7s/holochart-traces-finance': minor
'@mk7s/holochart-traces-hier': minor
'@mk7s/holochart-traces-3d': minor
'@mk7s/holochart-express': minor
---

A curated export surface. Nothing changes at runtime; this is about which names are API.

BREAKING: `@mk7s/holochart` exports a list of names instead of everything its packages export. It keeps the chart API, typed figures, the trace and component modules, themes, errors, the documented helpers and the experimental plugin API. The plumbing the packages share with each other is gone from it (`layoutBars`, `calcBar`, `supplyColorscaleDefaults`, `stashSplomAxis`, `RANGESELECTOR_Y_PAD`, `stripInternal`, `editDistance`, `warnOnce` and about 600 more), and so is `setBarExtruder`. Those names stay exported from their `@mk7s/holochart-*` packages, tagged `@internal`: not API, no compatibility promise. The script-tag global `window.Holochart` has the same names as `@mk7s/holochart`.

BREAKING: exports that were stable by default are now tagged. `@internal`: what only sibling packages import (in core, components and the trace packages). `@experimental`: what a plugin is written with, namely core's schema DSL (`attr`, the schema types and schema objects), color and date parsing and update planning, the trace packages' attribute schemas and calc types, the 3D scene API, and the `Chart` members `emit`, `getCalcdata`, `previewRanges`, `commitRanges` and `refreshHover`. The `Chart` constructor is `@internal`; use `createChart`.

BREAKING: names that meant different things in different packages were renamed on the less public side.

- core and runtime: `Layout` is now `BaseLayout`, `Frame` is `FrameInput`; core: `LayoutTitle` is `BaseLayoutTitle`. The plain names are the full bundle's types.
- traces-basic, traces-finance, traces-hier, traces-sci: `BarTrace`, `PieTrace`, `ScatterTrace`, `FunnelTrace`, `WaterfallTrace`, `IcicleTrace`, `TreemapTrace` and `HeatmapTrace` are now `BaseBarTrace`, `BasePieTrace` and so on. The plain names are the full bundle's types, which add the 2.5D attributes.
- traces-basic: `TimelineOptions` is `TimelineFigureOptions`; traces-stats: `StripOptions` is `StripFigureOptions`; express: `AnimationOptions` is `AnimationFrameOptions`.
- Experimental names: core's `TraceModule` and `ComponentModule` are `CoreTraceModule` and `CoreComponentModule`, its `RGBA` and `Primitive` are `RGBAColor` and `PrimitiveValue`; the runtime's `pointInPolygon` is `polygonContains`; render's `LineOptions` is `LinePrimitiveOptions`.

Types that leaked into the declarations under bundler-made names have real ones: core's `AttrBuilders` (the type of `attr`), the runtime's `TraceIndices`, and render's `MeshLazy`, `LinesMarkers3DLazy`, `ExtrusionLazy` and `PatternCode` namespaces (type-only).

Migration: import the figure types of the full bundle from `@mk7s/holochart` as before (`BarTrace`, `Layout`, `Frame` are unchanged there). In a partial bundle, rename the types above. If you imported an `@internal` name, copy the code you need. See "Unreleased: a curated export list" in the migration guide.
