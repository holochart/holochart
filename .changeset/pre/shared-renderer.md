---
'@mk7s/holochart-core': minor
'@mk7s/holochart-render': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-traces-3d': patch
'@mk7s/holochart-traces-hier': patch
---

Dashboards no longer run out of WebGL contexts. Browsers keep about 16 per page (8 on mobile) and blank the oldest canvas beyond that; a page of Holochart charts now uses at most 6 however many charts it has. The first 4 charts get a context of their own and later ones draw through one shared renderer, which renders each chart and copies the frame into that chart's canvas. `toImage` and `downloadImage` always draw through the shared renderer, so exporting no longer takes a context per call.

New `config.sharedRenderer`: `'auto'` (default), `true` to always share, `false` to always take a context. On a shared chart `chart.three.renderer.domElement` is not the chart's canvas: use `chart.three.root.canvas`. See the Dashboards guide and ADR-023.
