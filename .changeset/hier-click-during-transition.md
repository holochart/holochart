---
'@mk7s/holochart-traces-hier': patch
---

Sunburst, treemap and icicle: a click during a drill transition now does nothing, like plotly.js (`gd._transitioning`). Before, it emitted `sunburstclick`/`treemapclick`/`icicleclick` and `click` for a drill that then didn't happen.
