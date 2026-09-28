---
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-traces-sci': minor
'@mk7s/holochart-traces-finance': minor
'@mk7s/holochart-traces-basic': minor
'@mk7s/holochart': minor
---

P1 parity gaps (M5 carry-forward). **Polar box / lasso selection** (E6.3, E11.4): with `dragmode: 'select'` or `'lasso'`, a drag in a polar subplot's plot area selects `scatterpolar` markers inside it (in screen space, as plotly.js does with its mock axes) and `barpolar` bars whose outer-edge middle is inside (plotly.js `di.ct`); `selecting` / `selected` / `deselect` events whose points carry `r` and `theta`, Shift to add, double-click to clear, `selected` / `unselected` styles and `selectedpoints`, with touch too (the canvas takes every swipe while selecting). As in Plotly, polar selections are not stored in `layout.selections`. New runtime hooks: `ComponentView.selectArea` (a non-cartesian subplot's selection area, `SelectArea`) and `TraceModule.eventData` (extra point fields in selection events). **`funnelarea`** draws `marker.pattern` (per-stage arrays, patterned legend glyphs; from the lazy pattern chunk) and honors `layout.uniformtext` (`mode: 'hide' | 'show'`, `minsize`), negotiated between funnel areas like pie's; traces-basic exports `slicePattern`. **`heatmap` and `contour`** take `xperiod` / `yperiod` with `xperiod0` / `yperiod0` and `xperiodalignment` / `yperiodalignment` (core `alignPeriod`, cell centers and edges aligned, hover and events report the unaligned position) and draw on range-break axes in compressed space: rows and columns centered in a break are dropped as in Plotly, the others tile the compressed axis, contour paths are traced in compressed space. Calendars stay deferred.
