---
'@mk7s/holochart-runtime': minor
'@mk7s/holochart': minor
---

BREAKING: `chart.toJSON()` is removed. Call `chartToJSON(chart)` instead; it returns the same figure and reads the chart's registry through the new `chart.registry`. The method made every bundle carry the serializer (about 2.3 kB), also in apps that never save a figure. `JSON.stringify(chart)` now throws a `TypeError` that names `chartToJSON`.

Migration: replace `chart.toJSON()` with `chartToJSON(chart)`, and `JSON.stringify(chart)` with `JSON.stringify(chartToJSON(chart))`.
