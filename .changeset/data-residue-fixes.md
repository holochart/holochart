---
'@mk7s/holochart-core': patch
'@mk7s/holochart-traces-basic': patch
'@mk7s/holochart-traces-3d': patch
'@mk7s/holochart-traces-sci': patch
'@mk7s/holochart-traces-stats': patch
---

Figures written by plotly.py 6 and plotly.js now draw as given: a data array may be Plotly's `{ dtype, bdata, shape }` encoding of a typed array, in traces (`x`, `y`, a 2D `z`, per-point `marker.size`, …), in dataset columns and in the layout (`tickvals`). It used to be rejected as an invalid value and the data was dropped. A spec that cannot be decoded is reported like any other invalid value.

`BigInt64Array` and `BigUint64Array` data no longer throws while drawing: the values are plotted as numbers. Integers beyond ±2^53 are rounded to the nearest double.

A `colorscale` given as a plain list of colors (`['red', 'blue']`) is now used on marker, line and node colors, on `layout.coloraxis` and on surface traces. Before, the automatic colorscale replaced it unless `autocolorscale: false` was set as well. `autocolorscale: true` still asks for the automatic one.

A `colorscale` name that is not registered now warns once in the console, with the closest known name. The fallback is unchanged.

Histograms draw in the bar layer, as in Plotly: below box, violin, OHLC, candlestick and scatter traces on the same axes whatever the trace order, and in trace order among bars. They used to draw on top with the scatter traces. Set `zorder` to choose another order.

Contour traces with `contours.coloring: 'heatmap'` and manual levels: the colorscale and colorbar now span the levels' bands also when `contours.start` and `contours.end` are given in reverse order or `contours.size` is missing or not positive. The colors were wrong in those cases; the contour lines were already right.

Image traces on a log axis: when the picture starts at or below 0, the axis now autoranges over the pixels above 0 instead of collapsing to the picture's far edge.

Heatmap, contour, histogram2d and histogram2dcontour take a plain list of colors as `colorscale` too. Box and violin traces read positions given as a `{ dtype, bdata }` array or a `'@column'` reference, instead of treating them as absent and drawing one box at the trace name.
