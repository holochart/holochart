---
'@mk7s/holochart-components': patch
'@mk7s/holochart-traces-basic': patch
'@mk7s/holochart-traces-sci': patch
---

Legend glyphs of scatter, bar, scatterpolar and barpolar traces colored through a `coloraxis` now show the first point's colorscale color instead of black: the legend passes the layout to trace modules' `legendIcon`.
