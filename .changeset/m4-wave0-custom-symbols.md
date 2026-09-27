---
'@mk7s/holochart-core': minor
'@mk7s/holochart-render': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-components': minor
'@mk7s/holochart-traces-basic': minor
'@mk7s/holochart-traces-stats': minor
'@mk7s/holochart': minor
---

Custom marker symbols and image sprites (E8.11). `symbols.register('pin', { path, viewBox, anchor, fillRule })` turns an SVG path into a signed distance field in a shared atlas, so `'pin'`, `'pin-open'`, `'pin-dot'` and `'pin-open-dot'` are `marker.symbol` values everywhere markers are drawn (scatter, splom, box and violin points, legends), with outlines and `marker.angle`. `marker.symbol: 'text:🚀'` draws text and emoji glyphs. `marker.image` (scatter, splom) draws images from URLs or data URIs, one per trace or per point, from a mipmapped atlas. Images load asynchronously, and `chart.ready` and image export wait for them. The SDF generator, atlases and shader code load lazily, the first time a chart uses a custom marker. Enumerated attributes can take an `accepts` predicate for values registered at runtime.
