---
'@mk7s/holochart-traces-stats': minor
'@mk7s/holochart-render': minor
'@mk7s/holochart-core': minor
'@mk7s/holochart': minor
---

New package `@mk7s/holochart-traces-stats` (registered by the full bundle): `histogram` (Plotly's auto-binning incl. month bins and bin groups, every histfunc/histnorm, cumulative, stacking with bars), `histogram2d` (on a new heatmap render primitive) and `histogram2dcontour` (marching-squares contours with fills, lines and labels), `box` (sample or precomputed stats, all quartile methods, notches, outliers, grouping), `violin` (KDE, split sides, scale groups) and a `strip()` helper. The default template styles them for the dense dark look.
