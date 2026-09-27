---
'@mk7s/holochart-traces-basic': minor
'@mk7s/holochart': minor
---

Level of detail for big lines (E16.2): scatter lines of 100,000 points or more with increasing x draw through a cached min/max ("M4") pyramid, so each pixel column keeps its first, lowest, highest and last point and only the view plus one view width on each side is uploaded. Zoom and pan re-read a few thousand pyramid entries instead of the whole trace (a decade of one-minute bars, 2.6M points, pans without rebuilding the line), streaming (`extendTraces` / `prependTraces`) rebuilds only the pyramid chunks at the edited ends, and step shapes (`hv`, `vh`, `hvh`, `vhv`) are decimated too. It is on with `line.simplify` (default `true`); hover, selection, markers and fills still use every point. The pyramid code loads on first use as its own chunk. New docs: "Working with dates & time series" and "Log plots", with examples.
