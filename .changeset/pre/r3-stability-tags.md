---
'@mk7s/holochart': patch
'@mk7s/holochart-core': patch
'@mk7s/holochart-render': patch
'@mk7s/holochart-runtime': patch
---

Stability tags. The plugin API is now marked `@experimental` in the published types, so editors show which exports may still change in a minor release: the `render` namespace (`@mk7s/holochart-render`, except the `fonts` and `symbols` registries), the trace and component contracts and the helpers for module authors in `@mk7s/holochart-runtime` and `@mk7s/holochart-core`, and the chart members typed by those (`chart.three.root`, `.overlay`, `.viewports`, `.subplot()`, `chart.axes`, `chart.subplots`, `chart.interaction`). Everything else a package exports is stable. Nothing changes at runtime. See the versioning section of the migration guide.
