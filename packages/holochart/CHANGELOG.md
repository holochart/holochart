# @mk7s/holochart

## 0.1.0-alpha.0

### Minor Changes

- 2e457f5: BREAKING: `chart.toJSON()` is removed. Call `chartToJSON(chart)` instead; it returns the same figure and reads the chart's registry through the new `chart.registry`. The method made every bundle carry the serializer (about 2.3 kB), also in apps that never save a figure. `JSON.stringify(chart)` now throws a `TypeError` that names `chartToJSON`.

  Migration: replace `chart.toJSON()` with `chartToJSON(chart)`, and `JSON.stringify(chart)` with `JSON.stringify(chartToJSON(chart))`.

- 0ef6845: Maps. The new package `@mk7s/holochart-traces-geo` has the `geo` subplot (`layout.geo`, `geo2`, …) and the `scattergeo` and `choropleth` traces: Plotly's projections, scopes, `fitbounds`, graticule and base layers (land, ocean, coastlines, countries, lakes, rivers, subunits) at `resolution` 110 or 50; pan, zoom and rotate with Plotly's relayout keys; markers, great-circle lines, text and `fill: 'toself'` at `lon` / `lat` or at `locations`; and regions colored by value, from the basemap (`locationmode` `'ISO-3'`, `'USA-states'`, `'country names'`) or from your own `geojson` with `featureidkey`. Express gains `hx.scatterGeo`, `hx.lineGeo` and `hx.choropleth`.

  A 3D globe, which Plotly does not have: `projection.type: 'globe3d'` is the orthographic view drawn as a lit sphere, with the same rotation, scale, gestures and relayout keys. It turns by a matrix, so a rotation projects nothing at any resolution. On it `scattergeo` lines are arcs lifted above the surface (`line.lift`), and a choropleth's regions can rise as prisms by a second value (`elevation`, `elevationscale`), picked on the GPU so that nothing behind the globe or behind a prism is hit. These three attributes are Holochart's own and are ignored on a flat map. The globe's code is a lazy chunk, loaded when a figure has one.

  The full bundle does not include it, so an app without a map downloads no map code. Add it with one import; `@mk7s/holochart` depends on the package, so there is nothing more to install:

  ```ts
  import * as Holochart from '@mk7s/holochart';
  import '@mk7s/holochart/geo';
  ```

  `@mk7s/holochart/geo` registers the package and re-exports it. A partial bundle registers it like any trace package: `register(...tracesGeo)`. A `scattergeo` or `choropleth` trace, or `layout.geo`, on a chart without the package is ignored, and the warning now names the package and that import. The script-tag build has no maps yet.

  The basemap is Natural Earth 5.1.2 (public domain), built into the package as lazy chunks, two per resolution (about 40 kB gzipped for 1:110m, 285 kB for 1:50m), loaded when a map first needs them: a map makes no request outside the app's own bundle and works offline. Disputed boundaries are drawn by de facto control. The 15 projections of d3-geo are in the package's own code, and the country-name table of `'country names'` is a lazy chunk of its own; Plotly's other projection types load d3-geo-projection in one lazy chunk the first time a figure names one.

  New `config.topojsonURL` (core), with Plotly's meaning: when set, basemap files are fetched from `<url>/world_110m.json` and so on instead of the bundled data. Unlike Plotly it defaults to empty, which fetches nothing. The `holochart` template has a `geo` block, so maps match the dark look (land a step above the background, lakes cut out of it).

  For subplot authors (runtime, experimental): `SubplotViewportOptions.kind: '2d'` gives a non-cartesian subplot a pixel-space viewport like a cartesian subplot's instead of a 3D camera; `DomainLayoutContext.chart` is the chart, for subplots that keep state from one layout pass to the next; and a component view with `clickThrough` lets a press it took for dragging become a click on the point under it. A hover label now goes away when a component drag starts, and no longer appears under a finger lifted after a touch pan.

  Render (experimental): `MeshData.depthTest` and `depthWrite`, for a mesh that lies on a surface already drawn; `loadPicker()` and `loadFillTriangulation()`, which give lazy code the pickers and the polygon triangulation without bringing them into an app's initial chunk.

- 0ef6845: Network graphs. The new package `@mk7s/holochart-traces-graph` has the `graph` trace, which Plotly does not have: nodes (`node.label`, `x`, `y`, `size`, `color`, `symbol`, `group`) and the links between them (`link.source`, `target`, `value`, `color`, `width`, `dash`, `arrow`), shaped like sankey's so the same data feeds both, or the `ids` / `labels` / `parents` of the hierarchical traces. Links can have arrowheads, which stop at the edge of their node, parallel links curve apart and a self-link is a loop. Nodes are markers, sized by `node.size` or by their number of links (`node.sizeby`), or boxes around their labels (`node.shape: 'box'`). Labels are culled where they collide: the most connected nodes keep theirs and the rest appear on zoom. Nodes are colored by group, with one legend item per group, or by value, with a colorbar. Hover works on nodes and links, and box and lasso selection on nodes.

  `arrangement` says where the nodes go. `'preset'` takes `node.x` and `node.y` as data on the trace's axes, so a network can sit over a scatter, on date or log axes. Every other value computes the positions, with a deterministic layout that is also exported as a pure function over typed arrays, and each has an option container of its name:

  - `'force'` (the default without positions; `force`): a force-directed layout, as springs and repulsion (`force.algorithm: 'spring'`) or ForceAtlas2. Nodes with an `x` and a `y` are pinned; when every node has an `x` and none a `y`, the x axis stays a real axis and the layout only moves the nodes along y (a timeline). `force.simulate: true` shows the layout settling and ends on the same picture; it is skipped under `prefers-reduced-motion` and for graphs of more than 2,000 nodes or 10,000 links.
  - `'layered'` (`layered`): a directed graph in layers (`rankdir`, `ranksep`, `nodesep`, `ranker`), with links routed as splines, polylines or right angles (`routing`). Labelled nodes are boxes and links have arrowheads by default; `layered.clusters` frames the nodes of each group under its name; the links of a cyclic graph that had to be turned around are drawn in the `link.secondary` style (dashed).
  - `'tree'`, `'radial'`, `'dendrogram'` (`tree`): a tidy tree, the same tree on rings, and a tree with its leaves on one line and its nodes at the heights `node.value` gives, on a visible axis. They take `ids` / `labels` / `parents` or `node` / `link`; links that are not part of the tree are drawn in the `link.secondary` style. A click on a node that has children folds or unfolds its subtree: the chart restyles `tree.collapsed` and the tree moves to its new shape.
  - `'arc'` (`arc`) and `'hive'` (`hive`): an arc diagram and a hive plot.
  - `'circular'` and `'grid'`, and `'custom'`, which runs a layout the app registered with `registerGraphLayout(name, layout)`.

  New with them: `node.value` (a number per node: a dendrogram's heights, `tree.sort`, `hive.position`, `%{value}` in hover labels) and `link.secondary` (`dash`, `opacity`, `color`). Labels have room where the arrangement leaves some (`node.textposition: 'auto'`): along the radius of a radial tree, upright under an arc diagram or the leaves of a dendrogram. Box nodes of a computed arrangement shrink with the axes, text included, when the diagram is larger than the plot area.

  The trace is cartesian: it draws on its `xaxis` and `yaxis`, so zoom, pan, selection, `uirevision`, subplots and image export work as for a scatter. With a computed arrangement the axes are hidden, unless another trace shows them or the figure sets `visible`, and locked to one scale (a tidy tree and a dendrogram fill the plot area along each axis instead).

  The full bundle does not include it, so an app without a graph downloads no graph code. Add it with one import; `@mk7s/holochart` depends on the package, so there is nothing more to install:

  ```ts
  import * as Holochart from '@mk7s/holochart';
  import '@mk7s/holochart/graph';
  ```

  `@mk7s/holochart/graph` registers the package and re-exports it. A partial bundle registers it like any trace package: `register(...tracesGraph)`. A `graph` trace on a chart without the package is hidden, and the error names the package and that import. The script-tag build has no graphs yet.

  For trace authors (core, experimental): a trace module can give `axisHints(trace)`, which returns a `TraceAxisHints`: `hide` (the axes, or with `'x'` / `'y'` that axis, default to `visible: false` unless another trace is on them), `equal` (the y axis defaults to `scaleanchor` on the trace's x axis), `reverse` (`'x'` or `'y'`: that axis defaults to `autorange: 'reversed'`), and `x` / `y` (the data the trace puts on its axes when that is not its `x` / `y` attribute, for axis type detection).

- 0ef6845: More network graphs: two more trace types in `@mk7s/holochart-traces-graph`, interaction, accessibility and large graphs.

  - **`chord`**: a chord diagram, which Plotly does not have. Flows between nodes as ribbons inside a ring, from the `node` / `link` containers of `graph` and `sankey` or from a square `matrix` with `labels`. `directed` ribbons can end in an arrowhead (`link.arrowlen`), `node.group` adds an outer ring of groups, ribbons are colored by their source, their target or a gradient (`link.colorsource`), and a hover keeps the ribbons of one node. It is placed by `domain`.
  - **`graph3d`**: the `graph` model in a 3D `scene`: a force layout in three dimensions, `'layered'` with one plane per rank, or `'preset'` positions on the scene's axes. Nodes are lit spheres or sprites, links lines or tubes with cone arrowheads, parallel links fan out and a self-link is a ring. Nodes and links are picked on the GPU. Register it with `tracesGraph3d`, which brings the scene; `tracesGraph` alone bundles no 3D code. `import '@mk7s/holochart/graph'` registers both.
  - **Interaction** (`graph`): a hover highlights a node's neighbourhood (`highlight.hops`, `direction`, `dim`, `color`, `nodes`), and two selected nodes highlight a shortest path between them (`highlight.path`, `pathweight`, `pathdirected`; `graphPath(trace)` returns it). Nodes can be dragged under `'preset'` and `'force'` (`node.draggable`): the release restyles `node.x` / `node.y`, which pins a node of a force layout, and a double-click releases it; with `force.simulate` the layout reacts while a node is dragged. `force.start` continues a layout from given positions. Selection points list the links among the selected nodes, and `%{neighbors}` is a hover template variable.
  - **Large graphs** (`graph`): `worker: 'auto' | true` (or `config.worker`) runs the layout in the package's layout worker, `dist/layout-worker.js`, and draws the nodes while they settle; where a worker cannot start, the same code runs on the main thread in slices. `lod` leaves labels, arrowheads and node outlines out of a large graph until a zoom makes them readable, and fades links by how densely they cover the plot. `link.bundle` bundles links (`'hierarchical'` through the nodes' groups, `'force'` for graphs without groups). Exported for apps that lay graphs out themselves: `layoutInWorker`, `setGraphWorkerUrl`, `bundleLinks`.
  - **Accessibility**: the description of a graph names its most-connected nodes, its connected components and its groups, and its data table is the list of links. Arrow keys move from a node along its links (siblings, parent and child in a tree; rank by rank in a layered graph), and Enter folds a tree node. Five new announcement sentences and `Folded.` are translated in the ten locales.

  For trace authors (experimental): `TracePlotContext.recalc()` asks for a second calc pass without a change of the figure (a layout that arrived); `HoverPoint.selects` names the points a click on this one selects; `eventData` gets the selection as a fourth argument; `KeyboardPoint.click` lets Enter reach the click handling of a cartesian trace that handles clicks itself; `KeyboardStops.locate` re-finds the cursor in stops built on demand. `TraceAxisHints` gains `z`, and a 3D scene whose traces all hide their axes hides its own and starts with a closer camera.

- 7227276: First public alpha of Holochart: declarative, Plotly-compatible charts drawn on the GPU with three.js. Figures are Plotly's `{ data, layout, config, frames }`, with the same attribute names, defaults and events. All 14 packages share one version. This is an alpha on the `alpha` npm dist-tag: APIs may still change in any `0.x` minor.

  #### Install
  - `npm i @mk7s/holochart three` gives the full bundle. TypeScript users also add `@types/three`. The individual packages (`-core`, `-runtime`, `-traces-*`, …) build smaller bundles with `register(...)`.
  - `three` is a peer dependency, `>=0.180.0 <0.187.0`. The upper bound is the next three.js minor after the newest one tested in CI, and it is widened per release. `@types/three` is an optional peer with the same range for the packages whose types expose three's (`@mk7s/holochart`, `-render`, `-runtime`, `-components`, `-traces-3d`).
  - ESM-only. Every export has a `default` condition after `import`, so Node 22's `require(esm)` and tools that only know `default` can load the packages. The browsers supported have WebGL 2 and ES2022. Node ≥ 22 runs the renderer-free parts (`@mk7s/holochart-core`).
  - Locales are a separate install: `@mk7s/holochart-locales`.

  #### Chart types

  35 trace types, each with Plotly's attributes, defaults, hover and events:

  - **Basic:** `scatter` (markers, lines, splines, steps, text, error bars, areas with `fill` / `stackgroup` / `groupnorm`, bubbles), `bar` (grouped, stacked, relative, horizontal, `base`, periods), `pie` and donuts, `table` (virtualized rows, wrapped text, draggable column order), and a `timeline()` helper for Gantt charts.
  - **Statistical** (`-traces-stats`): `histogram` (Plotly's auto-binning, every `histfunc` / `histnorm`, cumulative), `histogram2d`, `histogram2dcontour`, `box`, `violin`, `splom`, `parcoords` (brushing, axis reordering) and `parcats`, plus a `strip()` helper.
  - **Scientific** (`-traces-sci`): `heatmap` (one GPU texture, `zsmooth`, annotated cells), `contour` (every `contours.coloring`, constraint contours, labels placed like Plotly's), `image`, and polar subplots with `scatterpolar` (radar charts) and `barpolar` (wind roses).
  - **Financial** (`-traces-finance`): `ohlc` and `candlestick` (range slider by default, `%{change}` in hover), `waterfall`, `funnel`, `funnelarea` and `indicator` (numbers, deltas, angular and bullet gauges).
  - **Hierarchical and flow** (`-traces-hier`): `sunburst`, `treemap` and `icicle` with Plotly's 750 ms drill-down transitions and path bar, and `sankey` (d3-sankey layout, draggable nodes, loops, and the `link.flow` particle extension).
  - **3D** (`-traces-3d`): scene subplots (`layout.scene`, cameras, turntable / orbit / pan / zoom, touch, 3D hover with spikes, `scene.annotations`) with `scatter3d` (1M points in one draw call), `surface`, `mesh3d` (Delaunay, convex hull, alpha shapes), `cone`, `streamtube`, `isosurface` and `volume` (Plotly's stacked isosurfaces or GPU ray marching). Holochart extensions: `bar3d`, tube and ribbon lines, lit spheres, three.js materials and scene lights, `chart.animateCamera` and `scene.autorotate`.
  - **2.5D** (full bundle): `layout.view3d` tilts cartesian subplots in perspective. `depth`, `bevel` and `material` extrude bars, funnels, waterfalls, heatmaps, filled areas, pies, treemaps and icicles, and hover, click and zoom stay exact on the tilted plane.

  Not yet supported Plotly traces: maps and geo (`scattergeo`, `choropleth`, `scattermap`, `densitymap`, …), `carpet` / `scattercarpet` / `contourcarpet`, `scatterternary`, and the quiver and streamline figure factories.

  #### Layout and components
  - **Axes:** linear, log, date and category / multicategory, with Plotly's tick generation and `tickformat`. Also `rangebreaks`, linked axes (`matches`), `scaleanchor` aspect locks, overlaying and shifted axes, spikelines, automargin, `layout.grid` and `makeSubplots()`.
  - **Legends:** multiple legends (`legend2`, …), group titles, scrolling past `maxheight`, and click / double-click toggling as in Plotly.
  - **Colorbars, annotations** (with arrows, rich text, drag and `clicktoshow`), **shapes** (drawing and editing, `addHline` / `addVrect` helpers), **layout images**, `updatemenus`, `sliders`, the range slider and range selector, `layout.selections`, and the **modebar** with Plotly's buttons, custom buttons and the 3D group.
  - **Rich text:** Plotly's pseudo-HTML (`<b>`, `<i>`, `<sup>`, `<span style>`, links, …) in every text attribute. Text is drawn as SDF glyphs on the GPU.
  - **Styling:** `marker.pattern` fills, custom SVG-path marker symbols (`symbols.register`), emoji and image markers, `styleRules` (JSON conditions that style points by their data) and per-point style functions.

  #### Runtime API
  - **Plotly's functional API:** `newPlot`, `react`, `restyle`, `relayout`, `update`, `addTraces`, `deleteTraces`, `moveTraces`, `extendTraces`, `prependTraces`, `purge`, `addFrames`, `deleteFrames`, `animate`, `toImage` and `downloadImage`. There is also an object API (`createChart(el, figure)`, `getChart(el)`) with `chart.ready` and update promises.
  - **Events:** Plotly's events (`hover`, `click`, `selected`, `relayout`, `restyle`, `legendclick`, `sunburstclick`, `animatingframe`, …), also under their `plotly_*` names. A listener that throws no longer stops the chart or the other listeners.
  - **Interaction:** hover modes (including unified hover), zoom, pan, box and lasso selection (on polar subplots too), scroll zoom, touch with pinch-zoom, and keyboard navigation between data points.
  - **Animation:** `react` with `layout.transition` and `figure.frames` with `animate`. Every Plotly easing is supported, points are matched by `ids`, and Plotly's Play / Pause buttons and frame sliders work.
  - **Big data:** streaming with `extendTraces`, min/max level of detail for lines of millions of points, and typed-array data.
  - **Export:** `toImage` / `downloadImage` to PNG, JPEG or WebP at any size and scale. `chartToJSON` / `fromJSON` round-trip figures.
  - **Errors:** without WebGL 2, `newPlot` rejects with `WebGLUnavailableError` and the container shows a note and the chart's text description. Errors extend `HolochartError`.

  #### Themes and the default look
  - New charts use the dark, dense `holochart` template, drawn with the bundled TeX Gyre Heros font. The font is loaded lazily and nothing is fetched from a CDN. Use `layout.template: 'plotly-classic'` (or `setDefaultTemplate('plotly-classic')`) for Plotly's own look.
  - 16 built-in themes: `holochart`, `plotly-classic`, `high-contrast`, `high-contrast-dark`, `neon`, and plotly.py's `plotly`, `plotly_white`, `plotly_dark`, `ggplot2`, `seaborn`, `simple_white`, `presentation`, `xgridoff`, `ygridoff`, `gridon` and `none`. `holochart-dark` is a deprecated alias of `holochart`.
  - Every plotly.py palette and colorscale, plus `colors.register`, `colorways.register`, `fonts.register` and `defineTemplate`.

  #### Express

  `@mk7s/holochart-express` builds figures from row objects, column objects, Apache Arrow tables or CSV, following Plotly Express (camelCase). The functions are `scatter`, `line`, `area`, `bar`, `timeline`, `pie`, `histogram`, `box`, `violin`, `strip`, `ecdf`, the density charts, `imshow`, `scatterMatrix`, the parallel charts, `funnel`, the polar charts, `sunburst`, `treemap`, `icicle`, `scatter3d` and `line3d`. They support facets, `animationFrame`, marginals, trendlines (OLS, LOWESS, rolling, expanding, EWM) and `ff.distplot`.

  #### Locales and accessibility
  - **Locales:** `config.locale` translates the UI and formats numbers and dates. `@mk7s/holochart-locales` ships plotly.js's 76 locales as ES modules and `<script>` files, and plotly.js locale modules register as they are. Arabic and Hebrew text is laid out right to left.
  - **Accessibility:** charts are `role="figure"` with a generated description, summaries of trends and extremes, and data tables (`chart.describe()`, `config.a11y`). There is keyboard access to points, legends, menus, sliders and the modebar. Also a high-contrast theme, the colorblind-safe `Safe` colorway, automatic patterns (`a11y.patterns`) and reduced-motion support.

  #### Script-tag builds
  - `@mk7s/holochart/dist/holochart.iife.min.js` defines `window.Holochart`, with three.js bundled. It is everything but 3D, and the bare jsDelivr / unpkg URL serves it. Types for the global are in `@mk7s/holochart/global`.
  - `holochart-3d.iife.min.js` is a 3D add-on, loaded after the main script of the same version. It adds 3D scenes, 3D traces and 2.5D, and reuses the main script's three.js.
  - Each locale is a script: `@mk7s/holochart-locales/dist/scripts/holochart-locale-<code>.js`.

  #### Known limitations
  - **WebGL 2 only.** There is no Canvas 2D or SVG fallback, and no SVG or PDF export (`toImage` gives raster images only).
  - **Tested in Chromium.** Visual and interaction tests run in headless Chromium. Firefox and Safari should work but aren't tested in CI.
  - **Missing features:** the Plotly traces listed under Chart types, non-Gregorian calendars, LaTeX, and keyboard navigation for most 3D traces.
  - **Experimental APIs:** the low-level `render` namespace and the trace and component contracts in `@mk7s/holochart-runtime` may change in any minor release.

- f576f33: Keyboard navigation reaches every chart family. With the plot area focused, the arrow keys now step through histogram bins, the statistics of each box and violin, heatmap, contour and histogram2d cells (a cell cursor: ← / → along the row, ↑ / ↓ along the column), funnelarea stages, sunburst, treemap and icicle nodes (← / → siblings, ↑ the parent, ↓ the first child; Enter drills and the cursor stays on its node), sankey nodes and links (↓ downstream, ↑ upstream), parcats categories, parcoords lines on each axis, polar points and bars, and scatter3d points. Every stop shows the hover label a pointer would get there and announces what it says, with its place in the chart ("row 2 of 3, column 1 of 4", "level 2, 1 of 5, children: 2").

  3D scenes take the view keys: Shift + arrows orbit the camera in 15° steps, `+` / `-` move it in and out and `0` resets it, each as one `relayout` of `scene.camera`.

  `bar3d`, `cone`, `streamtube`, `isosurface`, `volume` and `mesh3d` describe themselves to assistive technology (what is drawn, the box it spans, and a headline value), like `scatter3d` and `surface`.

  The code for all of this loads on first use, in one small chunk per trace package: the keyboard stops on a chart's first keyboard focus, the 3D descriptions right after a chart with a 3D trace is first described (it shows the generic line until then, and `chart.describe()` waits for it). The descriptions of `scatter3d` and `surface` moved into that chunk too. The script-tag build (`holochart.iife.min.js`) does not include the 2D families' stops yet; its 3D add-on includes the 3D chunk.

  Announcements read the lines of a hover label as a list, so a pie slice is now "Share: Alpha, 40, 40%, point 1 of 5." instead of "Share: Alpha 40 40%, point 1 of 5."

  For trace module authors: `keyboardPoints` may return stops that say where the arrows lead (`KeyboardPoint.nav`), show several labels (`more`) and bring their own announcement (`say`), or a list that builds its stops on demand (`KeyboardStops`); cartesian modules may have stops too. `TraceModule.a11y` loads a module's `keyboardPoints`, `describe` and `keyboardView` (view keys of a trace that is not on cartesian axes) from a chunk of its own. `sceneA11y` gives a trace built on the 3D scene its view keys, and `HoverContext.height` is the figure height for domain traces.

- 7227276: Typed figures. `@mk7s/holochart` exports `Figure`, `Data` (every trace type, discriminated on
  `type`), `Layout`, `Config` and `Frame`, generated from the attribute schemas, and
  `createChart`, `newPlot`, `react`, `addTraces`, `relayout`, `update` and `toImage` check figures
  against them. Each trace package exports its trace types (`ScatterTrace`, …) and their union
  (`TracesBasic`, …); core's `FigureInput<D, L>` stays loose by default for partial bundles and
  plugins, and plugins add trace types to `TraceTypes`. `restyle` keeps untyped attribute paths.
  Published types now also compile under `exactOptionalPropertyTypes`.
- e7c92ca: A curated export surface. Nothing changes at runtime; this is about which names are API.

  BREAKING: `@mk7s/holochart` exports a list of names instead of everything its packages export. It keeps the chart API, typed figures, the trace and component modules, themes, errors, the documented helpers and the experimental plugin API. The plumbing the packages share with each other is gone from it (`layoutBars`, `calcBar`, `supplyColorscaleDefaults`, `stashSplomAxis`, `RANGESELECTOR_Y_PAD`, `stripInternal`, `editDistance`, `warnOnce` and about 600 more), and so is `setBarExtruder`. Those names stay exported from their `@mk7s/holochart-*` packages, tagged `@internal`: not API, no compatibility promise. The script-tag global `window.Holochart` has the same names as `@mk7s/holochart`.

  BREAKING: exports that were stable by default are now tagged. `@internal`: what only sibling packages import (in core, components and the trace packages). `@experimental`: what a plugin is written with, namely core's schema DSL (`attr`, the schema types and schema objects), color and date parsing and update planning, the trace packages' attribute schemas and calc types, the 3D scene API, and the `Chart` members `emit`, `getCalcdata`, `previewRanges`, `commitRanges` and `refreshHover`. The `Chart` constructor is `@internal`; use `createChart`.

  BREAKING: names that meant different things in different packages were renamed on the less public side.

  - core and runtime: `Layout` is now `BaseLayout`, `Frame` is `FrameInput`; core: `LayoutTitle` is `BaseLayoutTitle`. The plain names are the full bundle's types.
  - traces-basic, traces-finance, traces-hier, traces-sci: `BarTrace`, `PieTrace`, `ScatterTrace`, `FunnelTrace`, `WaterfallTrace`, `IcicleTrace`, `TreemapTrace` and `HeatmapTrace` are now `BaseBarTrace`, `BasePieTrace` and so on. The plain names are the full bundle's types, which add the 2.5D attributes.
  - traces-basic: `TimelineOptions` is `TimelineFigureOptions`; traces-stats: `StripOptions` is `StripFigureOptions`; express: `AnimationOptions` is `AnimationFrameOptions`.
  - Experimental names: core's `TraceModule` and `ComponentModule` are `CoreTraceModule` and `CoreComponentModule`, its `RGBA` and `Primitive` are `RGBAColor` and `PrimitiveValue`; the runtime's `pointInPolygon` is `polygonContains`; render's `LineOptions` is `LinePrimitiveOptions`.

  Types that leaked into the declarations under bundler-made names have real ones: core's `AttrBuilders` (the type of `attr`), the runtime's `TraceIndices`, and render's `MeshLazy`, `LinesMarkers3DLazy`, `ExtrusionLazy` and `PatternCode` namespaces (type-only).

  Migration: import the figure types of the full bundle from `@mk7s/holochart` as before (`BarTrace`, `Layout`, `Frame` are unchanged there). In a partial bundle, rename the types above. If you imported an `@internal` name, copy the code you need. See "Unreleased: a curated export list" in the migration guide.

### Patch Changes

- 62fa8fb: Docs: a Dallas weather demo page that charts 87 years of daily readings from Dallas Love Field (NOAA): every daily high and low on one zoomable date axis, the year in days against its records, calendar and month-by-year heatmaps, rain through the year, a wind rose, a 3D temperature landscape, a climate spiral and an animated seasonal curve.
- 44953a7: Docs: a chemistry and physics basics demo page that walks through the periodic table, what things are made of, atoms and molecules, motion, waves, fields and the planets with more than 50 charts across 33 trace types, from heatmap, sunburst, parcats and bar3d to isosurface, volume, cone, streamtube, image and an animated pendulum.
- 44953a7: Docs: a TQQQ and SOXL demo page that charts 16 years of the two 3× ETFs, their holdings and how daily leverage behaves, with candlestick, OHLC, indicator, heatmap, 3D bar, surface, contour, sankey, sunburst, treemap, icicle, parcoords, parcats, splom, violin and more.
- 8f614fa: Stability tags. The plugin API is now marked `@experimental` in the published types, so editors show which exports may still change in a minor release: the `render` namespace (`@mk7s/holochart-render`, except the `fonts` and `symbols` registries), the trace and component contracts and the helpers for module authors in `@mk7s/holochart-runtime` and `@mk7s/holochart-core`, and the chart members typed by those (`chart.three.root`, `.overlay`, `.viewports`, `.subplot()`, `chart.axes`, `chart.subplots`, `chart.interaction`). Everything else a package exports is stable. Nothing changes at runtime. See the versioning section of the migration guide.
- Updated dependencies [363a64c]
- Updated dependencies [51001c1]
- Updated dependencies [2e457f5]
- Updated dependencies [f257a14]
- Updated dependencies [d68fbf4]
- Updated dependencies [0ef6845]
- Updated dependencies [44953a7]
- Updated dependencies [0ef6845]
- Updated dependencies [0ef6845]
- Updated dependencies [0ef6845]
- Updated dependencies [7227276]
- Updated dependencies [f576f33]
- Updated dependencies [3a7fb9b]
- Updated dependencies [7227276]
- Updated dependencies [e7c92ca]
- Updated dependencies [8f614fa]
- Updated dependencies [0ef6845]
- Updated dependencies [d708828]
  - @mk7s/holochart-traces-stats@0.1.0-alpha.0
  - @mk7s/holochart-traces-3d@0.1.0-alpha.0
  - @mk7s/holochart-runtime@0.1.0-alpha.0
  - @mk7s/holochart-core@0.1.0-alpha.0
  - @mk7s/holochart-render@0.1.0-alpha.0
  - @mk7s/holochart-components@0.1.0-alpha.0
  - @mk7s/holochart-traces-sci@0.1.0-alpha.0
  - @mk7s/holochart-express@0.1.0-alpha.0
  - @mk7s/holochart-traces-graph@0.1.0-alpha.0
  - @mk7s/holochart-traces-geo@0.1.0-alpha.0
  - @mk7s/holochart-traces-basic@0.1.0-alpha.0
  - @mk7s/holochart-traces-finance@0.1.0-alpha.0
  - @mk7s/holochart-traces-hier@0.1.0-alpha.0
  - @mk7s/holochart-themes@0.1.0-alpha.0
