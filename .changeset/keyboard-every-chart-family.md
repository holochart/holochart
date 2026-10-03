---
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-traces-hier': minor
'@mk7s/holochart-traces-stats': minor
'@mk7s/holochart-traces-sci': minor
'@mk7s/holochart-traces-finance': minor
'@mk7s/holochart-traces-3d': minor
'@mk7s/holochart': minor
---

Keyboard navigation reaches every chart family. With the plot area focused, the arrow keys now step through histogram bins, the statistics of each box and violin, heatmap, contour and histogram2d cells (a cell cursor: ← / → along the row, ↑ / ↓ along the column), funnelarea stages, sunburst, treemap and icicle nodes (← / → siblings, ↑ the parent, ↓ the first child; Enter drills and the cursor stays on its node), sankey nodes and links (↓ downstream, ↑ upstream), parcats categories, parcoords lines on each axis, polar points and bars, and scatter3d points. Every stop shows the hover label a pointer would get there and announces what it says, with its place in the chart ("row 2 of 3, column 1 of 4", "level 2, 1 of 5, children: 2").

3D scenes take the view keys: Shift + arrows orbit the camera in 15° steps, `+` / `-` move it in and out and `0` resets it, each as one `relayout` of `scene.camera`.

`bar3d`, `cone`, `streamtube`, `isosurface`, `volume` and `mesh3d` describe themselves to assistive technology (what is drawn, the box it spans, and a headline value), like `scatter3d` and `surface`.

The code for all of this loads on first use, in one small chunk per trace package: the keyboard stops on a chart's first keyboard focus, the 3D descriptions right after a chart with a 3D trace is first described (it shows the generic line until then, and `chart.describe()` waits for it). The descriptions of `scatter3d` and `surface` moved into that chunk too. The script-tag build (`holochart.iife.min.js`) does not include the 2D families' stops yet; its 3D add-on includes the 3D chunk.

Announcements read the lines of a hover label as a list, so a pie slice is now "Share: Alpha, 40, 40%, point 1 of 5." instead of "Share: Alpha 40 40%, point 1 of 5."

For trace module authors: `keyboardPoints` may return stops that say where the arrows lead (`KeyboardPoint.nav`), show several labels (`more`) and bring their own announcement (`say`), or a list that builds its stops on demand (`KeyboardStops`); cartesian modules may have stops too. `TraceModule.a11y` loads a module's `keyboardPoints`, `describe` and `keyboardView` (view keys of a trace that is not on cartesian axes) from a chunk of its own. `sceneA11y` gives a trace built on the 3D scene its view keys, and `HoverContext.height` is the figure height for domain traces.
