---
'@mk7s/holochart-render': minor
'@mk7s/holochart-traces-basic': patch
'@mk7s/holochart-components': patch
'@mk7s/holochart': patch
---

Smaller bundles: the fill code (earcut and polygon arrangement) loads lazily the first time a fill, shape or annotation box is drawn, and the bar, pie and table schemas no longer end up in scatter-only bundles (core + scatter initial chunk 139 → 130 kB).
