---
'@mk7s/holochart-core': minor
'@mk7s/holochart-render': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-components': patch
'@mk7s/holochart-traces-sci': patch
---

A chart created in a hidden or unsized element (an inactive tab, a closed dialog) no longer stays at 700 × 450: without `config.responsive` it now takes the element's size once, the first time the element has one.

New `config.maxPixelRatio` (default 2): the upper limit of the pixel ratio that `pixelRatio: 'auto'` takes from the display.

Polar zoom-box drags work for charts in another window's document (an iframe or popup created by the page's script).

An unknown trace type that is one of Holochart's own now says which package to register: "`sankey` is in @mk7s/holochart-traces-hier; import it from there and call `register(sankey)`". Core exports `tracePackage`, and the warn-once helpers `warnOnce` and `deprecate`. The new "Errors and warnings" reference page lists which calls reject and which warn.
