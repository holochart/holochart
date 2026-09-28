---
'@mk7s/holochart-traces-basic': patch
'@mk7s/holochart-traces-stats': patch
---

Colorscaled colors: CSS colors among the numbers of a colorscaled `marker.color` (or `marker.line.color`) array are drawn as given, and only the numbers go through the colorscale, as Plotly's `makeColorScaleFunc` does. They were drawn in the gray `nanColor`, so a style rule setting `'marker.color': 'gold'` on a colorscaled scatter, bar, barpolar, funnel or splom trace grayed the points it matched. Scatter markers keep the GPU colorscale path for all-numeric arrays and resolve mixed ones per point; hover and legend colors follow the drawn color.
